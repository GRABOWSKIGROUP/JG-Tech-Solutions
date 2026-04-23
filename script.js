const yearEl = document.getElementById("year");
if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
}

const navMenuButton = document.querySelector(".nav-menu-btn");
const mainNav = document.querySelector("nav");
const navLinksContainer = document.querySelector(".nav-links");

if (navMenuButton instanceof HTMLButtonElement && mainNav instanceof HTMLElement && navLinksContainer instanceof HTMLElement) {
    const menuLabel = navMenuButton.querySelector(".menu-label");

    const closeMenu = () => {
        mainNav.classList.remove("menu-open");
        navMenuButton.setAttribute("aria-expanded", "false");
        if (menuLabel) {
            menuLabel.textContent = "Menu";
        }
    };

    navMenuButton.addEventListener("click", () => {
        const isOpen = mainNav.classList.toggle("menu-open");
        navMenuButton.setAttribute("aria-expanded", String(isOpen));
        if (menuLabel) {
            menuLabel.textContent = isOpen ? "Close" : "Menu";
        }
    });

    navLinksContainer.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", closeMenu);
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 600) {
            closeMenu();
        }
    });
}

const revealItems = Array.from(document.querySelectorAll(".reveal"));
if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }
                entry.target.classList.add("visible");
                observer.unobserve(entry.target);
            });
        },
        { threshold: 0.14 }
    );

    revealItems.forEach((item, index) => {
        item.style.transitionDelay = `${Math.min(index * 45, 260)}ms`;
        revealObserver.observe(item);
    });
} else {
    revealItems.forEach((item) => item.classList.add("visible"));
}

const faqButtons = Array.from(document.querySelectorAll(".faq-q"));
faqButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const item = button.closest(".faq-item");
        if (!item) {
            return;
        }

        const wasOpen = item.classList.contains("open");

        document.querySelectorAll(".faq-item.open").forEach((openItem) => {
            openItem.classList.remove("open");
            const openButton = openItem.querySelector(".faq-q");
            if (openButton) {
                openButton.setAttribute("aria-expanded", "false");
            }
        });

        if (!wasOpen) {
            item.classList.add("open");
            button.setAttribute("aria-expanded", "true");
        }
    });
});

const compactSections = Array.from(document.querySelectorAll(".compact-sections .content-section"));
if (compactSections.length > 0) {
    compactSections.forEach((section) => {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "section-toggle";
        toggle.textContent = "Read more";
        toggle.setAttribute("aria-expanded", "false");

        toggle.addEventListener("click", () => {
            const isExpanded = section.classList.toggle("is-expanded");
            toggle.textContent = isExpanded ? "Show less" : "Read more";
            toggle.setAttribute("aria-expanded", String(isExpanded));
        });

        section.appendChild(toggle);
    });

    const mobileCompactQuery = window.matchMedia("(max-width: 760px)");

    const syncCompactMode = () => {
        const isCompact = mobileCompactQuery.matches;
        document.body.classList.toggle("compact-mode", isCompact);

        compactSections.forEach((section) => {
            const toggle = section.querySelector(".section-toggle");
            if (!(toggle instanceof HTMLButtonElement)) {
                return;
            }

            if (isCompact) {
                section.classList.remove("is-expanded");
                toggle.textContent = "Read more";
                toggle.setAttribute("aria-expanded", "false");
            } else {
                section.classList.add("is-expanded");
                toggle.textContent = "Show less";
                toggle.setAttribute("aria-expanded", "true");
            }
        });
    };

    syncCompactMode();
    if (typeof mobileCompactQuery.addEventListener === "function") {
        mobileCompactQuery.addEventListener("change", syncCompactMode);
    } else {
        mobileCompactQuery.addListener(syncCompactMode);
    }
}

const contactForms = Array.from(document.querySelectorAll(".contact-form"));
contactForms.forEach((contactForm) => {
    if (!(contactForm instanceof HTMLFormElement)) {
        return;
    }

    const statusEl = contactForm.querySelector(".form-status");
    const button = contactForm.querySelector("button");
    const successMessage = contactForm.getAttribute("data-success-message") || "Message sent. We will reach out soon.";
    const errorMessage = contactForm.getAttribute("data-error-message") || "Send failed. Please call 512-540-6522 or email JoshuaG@JGTechSolutions.net.";

    contactForm.addEventListener("submit", (event) => {
        event.preventDefault();

        if (!(button instanceof HTMLButtonElement)) {
            return;
        }

        const actionUrl = String(contactForm.getAttribute("action") || "");
        const submitUrl = actionUrl.includes("formsubmit.co/")
            ? actionUrl.replace("formsubmit.co/", "formsubmit.co/ajax/")
            : actionUrl;
        const webhookUrl = String(contactForm.getAttribute("data-webhook-url") || "").trim();
        const hasWebhook = webhookUrl.startsWith("http://") || webhookUrl.startsWith("https://");
        const hasEmailSubmit = Boolean(submitUrl);

        if (!hasWebhook && !hasEmailSubmit) {
            if (statusEl) {
                statusEl.textContent = "Unable to submit right now. Please call 512-540-6522.";
                statusEl.classList.add("is-error");
            }
            return;
        }

        const previousText = button.textContent || "Send Request";
        button.textContent = "Sending...";
        button.disabled = true;

        if (statusEl) {
            statusEl.textContent = "";
            statusEl.classList.remove("is-error");
        }

        const webhookPayload = {
            ...Object.fromEntries(new FormData(contactForm).entries()),
            source: "jgtechsolutions.net",
            page: window.location.pathname,
            submittedAt: new Date().toISOString()
        };

        let requestChain = Promise.resolve();

        if (hasWebhook) {
            requestChain = requestChain.then(() =>
                fetch(webhookUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json"
                    },
                    body: JSON.stringify(webhookPayload)
                }).then((response) => {
                    if (!response.ok) {
                        throw new Error("Webhook request failed");
                    }
                })
            );
        }

        if (hasEmailSubmit) {
            requestChain = requestChain.then(() =>
                fetch(submitUrl, {
                    method: "POST",
                    body: new FormData(contactForm),
                    headers: {
                        Accept: "application/json"
                    }
                }).then((response) => {
                    if (!response.ok) {
                        throw new Error("Request failed");
                    }
                })
            );
        }

        requestChain
            .then(() => {
                contactForm.reset();
                if (statusEl) {
                    statusEl.textContent = successMessage;
                    statusEl.classList.remove("is-error");
                }
            })
            .catch(() => {
                if (statusEl) {
                    statusEl.textContent = errorMessage;
                    statusEl.classList.add("is-error");
                }
            })
            .finally(() => {
                button.textContent = previousText;
                button.disabled = false;
            });
    });
});
