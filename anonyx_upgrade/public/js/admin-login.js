/**
 * Anonyx Pro Admin Login Controller
 * Handles authentication gateway and redirection logic.
 * Note: Server handles initial redirection logic.
 */

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginBtn');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const msgArea = document.getElementById('msg');

    if (!loginBtn) return;

    /**
     * Submission Handler
     */
    const handleLogin = async () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            msgArea.innerText = "Crucial credentials missing.";
            return;
        }

        msgArea.innerText = "";
        const originalText = loginBtn.innerHTML;
        loginBtn.innerHTML = "Verifying Identity... <div class='loader-spin' style='width:14px; height:14px; margin:0; display:inline-block'></div>";
        loginBtn.disabled = true;

        try {
            const res = await fetch('/admin/login', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                msgArea.innerText = data.message || "Invalid administrative credentials.";
                loginBtn.innerHTML = originalText;
                loginBtn.disabled = false;
                return;
            }

            // Redirect to dashboard on success
            msgArea.style.color = "#10b981";
            msgArea.innerText = "Identity Synchronized. Redirecting...";
            
            setTimeout(() => {
                window.location.href = '/admin';
            }, 500);

        } catch (err) {
            msgArea.innerText = "Connection Refused. Is the server offline?";
            loginBtn.innerHTML = originalText;
            loginBtn.disabled = false;
        }
    };

    /**
     * Event Listeners
     */
    loginBtn.onclick = handleLogin;

    [usernameInput, passwordInput].forEach(el => {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    });
});
