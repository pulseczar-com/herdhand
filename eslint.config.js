const expo = require("eslint-config-expo/flat");
const tseslint = require("typescript-eslint");

module.exports = [
  ...expo,
  ...tseslint.configs.recommended,
  {
    ignores: ["node_modules/**", ".expo/**", "dist/**", "android/**", "ios/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // React Native renders text through <Text>, where an apostrophe is just an apostrophe.
      "react/no-unescaped-entities": "off",
    },
  },
  {
    // Node loads this file as CommonJS, where require() is the only import form.
    files: ["*.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
