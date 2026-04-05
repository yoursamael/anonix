/**
 * Anonyx Pro Admin API Utility
 * A standardized fetch wrapper for authenticated administrative actions.
 */

window.AdminAPI = {
  /**
   * Performs an authenticated fetch with proper headers and error handling.
   * Redirects to login only on 401 Unauthorized.
   */
  async safeFetch(url, options = {}) {
    const finalOptions = {
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    };

    try {
      const res = await fetch(url, finalOptions);

      if (!res.ok) {
        if (res.status === 401) {
          // Full page redirect for auth failures
          window.location.href = "/admin/login";
          throw new Error("Unauthorized Session");
        }
        
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed with status ${res.status}`);
      }

      // Ensure we always return JSON to the caller
      return await res.json();

    } catch (err) {
      console.error(`[API Error] ${url}:`, err.message);
      throw err;
    }
  },

  /**
   * Helper to perform a POST request.
   */
  async post(url, body = {}) {
    return this.safeFetch(url, {
      method: "POST",
      body: JSON.stringify(body)
    });
  },

  /**
   * Helper to perform a DELETE request.
   */
  async delete(url) {
    return this.safeFetch(url, { method: "DELETE" });
  },

  /**
   * Sanitizes text to prevent XSS.
   */
  sanitize(text) {
    if (typeof text !== "string") return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
};