/**
 * Heartland Inspection Group — Shared JS Utilities
 * Phone formatting, form handler, FAQ accordion.
 * Include on any page that uses these features.
 */

// ========================
// Phone Number Auto-Format: (XXX) XXX-XXXX
// ========================
(function() {
    var phoneInput = document.getElementById('formPhone');
    if (!phoneInput) return;

    phoneInput.addEventListener('input', function() {
        var digits = this.value.replace(/\D/g, '').substring(0, 10);
        var formatted = '';
        if (digits.length > 0) formatted = '(' + digits.substring(0, 3);
        if (digits.length >= 3) formatted += ') ';
        if (digits.length > 3) formatted += digits.substring(3, 6);
        if (digits.length >= 6) formatted += '-' + digits.substring(6, 10);
        this.value = formatted;
    });
})();

// ========================
// Contact Form Handler (Netlify Forms)
// ========================
(function() {
    var form = document.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', function(e) {
        e.preventDefault();

        var btn = form.querySelector('.form-submit-btn');
        var successEl = document.getElementById('formSuccess');
        var errorEl = document.getElementById('formError');

        if (successEl) successEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';

        var origText = btn.textContent;
        btn.textContent = 'Sending\u2026';
        btn.disabled = true;

        var formData = new FormData(form);

        fetch('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(formData).toString()
        })
        .then(function(response) {
            if (response.ok) {
                if (successEl) successEl.style.display = 'block';
                form.reset();
            } else {
                throw new Error('Form submission failed');
            }
        })
        .catch(function(err) {
            console.error('Form error:', err);
            if (errorEl) errorEl.style.display = 'block';
        })
        .finally(function() {
            btn.textContent = origText;
            btn.disabled = false;
        });
    });
})();

// ========================
// FAQ Accordion
// ========================
(function() {
    document.querySelectorAll('.faq-question').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var item = this.closest('.faq-item');
            var answer = item.querySelector('.faq-answer');
            var isOpen = item.classList.contains('open');

            // Close all others
            document.querySelectorAll('.faq-item.open').forEach(function(openItem) {
                if (openItem !== item) {
                    openItem.classList.remove('open');
                    openItem.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
                    openItem.querySelector('.faq-answer').style.maxHeight = '0';
                }
            });

            if (isOpen) {
                item.classList.remove('open');
                this.setAttribute('aria-expanded', 'false');
                answer.style.maxHeight = '0';
            } else {
                item.classList.add('open');
                this.setAttribute('aria-expanded', 'true');
                answer.style.maxHeight = answer.scrollHeight + 'px';
            }
        });
    });
})();
