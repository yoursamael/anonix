/**
 * Anonyx Pro Admin Login Controller
 * Handles authentication gateway and redirection logic.
 * Note: Server handles initial redirection logic.
 */

document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== "undefined" && lucide.createIcons) {
        try { lucide.createIcons(); } catch (_) {}
    }
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnLabel = document.getElementById("loginBtnLabel");
    const loginBtnSpinner = document.getElementById("loginBtnSpinner");
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const msgArea = document.getElementById('msg');

    if (!loginBtn) return;

    const setMessage = (text, kind = "error") => {
        if (!msgArea) return;
        msgArea.classList.toggle("is-success", kind === "success");
        msgArea.innerText = text || "";
    };

    const setLoading = (isLoading) => {
        if (loginBtnSpinner) loginBtnSpinner.classList.toggle("hidden", !isLoading);
        if (loginBtnLabel) loginBtnLabel.innerText = isLoading ? "Verifying identity" : "Verify credentials";
        loginBtn.disabled = !!isLoading;
    };

    /**
     * Submission Handler
     */
    const handleLogin = async () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            setMessage("Crucial credentials missing.");
            return;
        }

        setMessage("");
        setLoading(true);

        try {
            const res = await fetch('/admin/login', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                setMessage(data.message || "Invalid administrative credentials.");
                setLoading(false);
                return;
            }

            // Redirect to dashboard on success
            setMessage("Identity synchronized. Redirecting...", "success");
            
            setTimeout(() => {
                window.location.href = '/admin';
            }, 500);

        } catch (err) {
            setMessage("Connection refused. Is the server offline?");
            setLoading(false);
        }
    };

    /**
     * Event Listeners
     */
    loginBtn.addEventListener("click", handleLogin);

    [usernameInput, passwordInput].forEach(el => {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    });
});
