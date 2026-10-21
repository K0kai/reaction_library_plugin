import equicord from "../Equicord/eslint.config.mjs";

export default [
    ...equicord,
    { ignores: ["dorion/**", "test/**", "index.tsx"] },
    {
        files: ["src/**/*.js"],
        languageOptions: { parserOptions: { project: null } },
        rules: { "@typescript-eslint/dot-notation": "off", "simple-header/header": "off", "no-unused-vars": ["error", { "caughtErrors": "none" }] }
    }
];
