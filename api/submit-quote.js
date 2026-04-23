const nodemailer = require("nodemailer");
const crypto = require("crypto");

const SQUARE_API_BASE = "https://connect.squareup.com";
const SQUARE_VERSION = "2025-10-16";
const MONTHLY_NOTE = "Monthly plan credit applies toward labor this month only. Unused credit does not roll over.";
const DIAGNOSTIC_NOTE = "Applied toward repair cost if work proceeds.";

function parseJsonBody(body) {
    if (!body) {
        return null;
    }

    if (typeof body === "string") {
        try {
            return JSON.parse(body);
        } catch {
            return null;
        }
    }

    if (typeof body === "object") {
        return body;
    }

    return null;
}

function isMonthlyPlan(name) {
    const lower = String(name || "").toLowerCase();
    return lower.includes("priority care") || lower.includes("priority support");
}

function isDiagnostic(name) {
    return String(name || "").toLowerCase().includes("diagnostic");
}

function buildLineItemNote(item) {
    const parts = [];
    if (item.description) {
        parts.push(String(item.description));
    }
    if (isMonthlyPlan(item.name)) {
        parts.push(MONTHLY_NOTE);
    }
    if (isDiagnostic(item.name)) {
        parts.push(DIAGNOSTIC_NOTE);
    }
    return parts.join(" | ");
}

function toCents(amount) {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 0;
    }
    return Math.round(parsed * 100);
}

function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing environment variable: ${name}`);
    }
    return value;
}

async function squareRequest(path, body, accessToken) {
    const response = await fetch(`${SQUARE_API_BASE}${path}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Square-Version": SQUARE_VERSION
        },
        body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const details = data && data.errors ? JSON.stringify(data.errors) : "Unknown Square error";
        throw new Error(`Square request failed (${path}): ${details}`);
    }

    return data;
}

function buildOwnerEmailHtml(payload, invoiceId) {
    const selectedServices = Array.isArray(payload.selectedServices) && payload.selectedServices.length > 0
        ? payload.selectedServices
        : payload.lineItems;

    const serviceRows = selectedServices
        .map((item) => {
            const amount = Number(item.amount);
            const amountLabel = Number.isFinite(amount) && amount > 0 ? `$${amount.toFixed(2)}` : "TBD";
            return `<li><strong>${item.name}</strong> - ${amountLabel}<br>${item.description || "No description provided"}</li>`;
        })
        .join("");

    return `
        <h2>New JG Tech Quote</h2>
        <p><strong>Client:</strong> ${payload.clientName}</p>
        <p><strong>Email:</strong> ${payload.clientEmail}</p>
        <p><strong>Phone:</strong> ${payload.clientPhone}</p>
        <p><strong>Client Type:</strong> ${payload.clientType}</p>
        <p><strong>Consent to Contact:</strong> ${payload.consentToContact ? "Yes" : "No"}</p>
        <p><strong>Pricing Disclaimer Accepted:</strong> ${payload.pricingDisclaimer ? "Yes" : "No"}</p>
        <p><strong>Square Invoice ID:</strong> ${invoiceId}</p>
        <p><strong>Total Quote:</strong> $${Number(payload.total).toFixed(2)}</p>
        <p><strong>Submitted:</strong> ${new Date().toISOString()}</p>
        <h3>Selected Services</h3>
        <ul>${serviceRows}</ul>
    `;
}

module.exports = async (req, res) => {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    let payload;
    try {
        payload = parseJsonBody(req.body);
        if (!payload) {
            return res.status(400).json({ error: "Invalid JSON body" });
        }

        if (!payload.pricingDisclaimer) {
            return res.status(400).json({ error: "Pricing disclaimer must be accepted." });
        }

        const requiredStrings = ["clientType", "clientName", "clientEmail", "clientPhone"];
        for (const field of requiredStrings) {
            if (!String(payload[field] || "").trim()) {
                return res.status(400).json({ error: `Missing required field: ${field}` });
            }
        }

        if (!Array.isArray(payload.lineItems) || payload.lineItems.length === 0) {
            return res.status(400).json({ error: "At least one line item is required." });
        }
    } catch (error) {
        console.error("Payload validation error", error);
        return res.status(400).json({ error: "Invalid request payload" });
    }

    let squareInvoiceId;

    try {
        const squareAccessToken = requireEnv("SQUARE_ACCESS_TOKEN");
        const squareLocationId = requireEnv("SQUARE_LOCATION_ID");

        const customerCreate = await squareRequest(
            "/v2/customers",
            {
                idempotency_key: crypto.randomUUID(),
                given_name: payload.clientName,
                email_address: payload.clientEmail,
                phone_number: payload.clientPhone,
                reference_id: `jg-quote-${Date.now()}`
            },
            squareAccessToken
        );

        const customerId = customerCreate.customer && customerCreate.customer.id;
        if (!customerId) {
            throw new Error("Square customer creation returned no customer ID");
        }

        const orderLineItems = payload.lineItems.map((item) => {
            const cents = toCents(item.amount);
            if (cents <= 0) {
                throw new Error(`Invalid line item amount for ${item.name}`);
            }

            return {
                name: String(item.name || "Service"),
                quantity: "1",
                base_price_money: {
                    amount: cents,
                    currency: "USD"
                },
                note: buildLineItemNote(item)
            };
        });

        const orderCreate = await squareRequest(
            "/v2/orders",
            {
                idempotency_key: crypto.randomUUID(),
                order: {
                    location_id: squareLocationId,
                    line_items: orderLineItems
                }
            },
            squareAccessToken
        );

        const orderId = orderCreate.order && orderCreate.order.id;
        if (!orderId) {
            throw new Error("Square order creation returned no order ID");
        }

        const dueDate = new Date().toISOString().slice(0, 10);
        const invoiceCreate = await squareRequest(
            "/v2/invoices",
            {
                idempotency_key: crypto.randomUUID(),
                invoice: {
                    location_id: squareLocationId,
                    order_id: orderId,
                    primary_recipient: {
                        customer_id: customerId
                    },
                    title: `JG Tech Quote - ${payload.clientName}`,
                    description: "Quote request submitted from jgtechsolutions.com",
                    delivery_method: "EMAIL",
                    payment_requests: [
                        {
                            request_type: "BALANCE",
                            due_date: dueDate,
                            automatic_payment_source: "NONE"
                        }
                    ]
                }
            },
            squareAccessToken
        );

        squareInvoiceId = invoiceCreate.invoice && invoiceCreate.invoice.id;
        if (!squareInvoiceId) {
            throw new Error("Square invoice creation returned no invoice ID");
        }
    } catch (error) {
        console.error("Square quote submission failed", error);
        return res.status(502).json({ error: "Unable to create Square invoice right now. Please try again shortly." });
    }

    try {
        const smtpUser = requireEnv("ZOHO_SMTP_USER");
        const smtpPass = requireEnv("ZOHO_SMTP_PASS");
        const ownerEmail = requireEnv("OWNER_EMAIL");

        const transport = nodemailer.createTransport({
            host: "smtp.zoho.com",
            port: 465,
            secure: true,
            auth: {
                user: smtpUser,
                pass: smtpPass
            }
        });

        const dateLabel = new Date().toISOString().slice(0, 10);
        await transport.sendMail({
            from: smtpUser,
            to: ownerEmail,
            subject: `New JG Tech Quote - ${payload.clientName} - ${dateLabel}`,
            html: buildOwnerEmailHtml(payload, squareInvoiceId)
        });
    } catch (emailError) {
        console.error("Quote email notification failed", emailError);
    }

    return res.status(200).json({
        message: "Your quote has been submitted. You will be contacted shortly.",
        invoiceId: squareInvoiceId
    });
};
