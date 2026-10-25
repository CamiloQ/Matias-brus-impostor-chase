let recommendedRules = {
    "no-empty": "error"
};
try {
    const js = (await import("@eslint/js")).default;
    if (js && js.configs && js.configs.recommended) {
        recommendedRules = { ...js.configs.recommended.rules };
    }
} catch {
    // Standalone fallback when @eslint/js is not in node_modules
}

export default [
    {
        files: ["client/js/**/*.js", "client/sw.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                performance: "readonly",
                requestAnimationFrame: "readonly",
                screen: "readonly",
                alert: "readonly",
                prompt: "readonly",
                window: "readonly",
                document: "readonly",
                console: "readonly",
                localStorage: "readonly",
                fetch: "readonly",
                URLSearchParams: "readonly",
                Audio: "readonly",
                AudioContext: "readonly",
                webkitAudioContext: "readonly",
                setTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                clearTimeout: "readonly",
                WebSocket: "readonly",
                Math: "readonly",
                Blob: "readonly",
                URL: "readonly",
                Image: "readonly",
                Date: "readonly",
                JSON: "readonly",
                parseInt: "readonly",
                parseFloat: "readonly",
                sessionStorage: "readonly",
                navigator: "readonly",
                caches: "readonly",
                self: "readonly",
                importScripts: "readonly",
                clients: "readonly"
            }
        },
        rules: {
            ...recommendedRules,
            "no-unused-vars": "warn",
            "no-undef": "off"
        }
    }
];
