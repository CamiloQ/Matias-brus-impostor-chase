import js from "@eslint/js";

export default [
    js.configs.recommended,
    {
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
            "no-unused-vars": "warn",
            "no-undef": "error"
        }
    }
];
