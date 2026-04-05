import globals from 'globals';

export default [
    {
        files: ['**/*.user.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: {
                ...globals.browser,
                // Tampermonkey / Greasemonkey APIs
                GM_getValue: 'readonly',
                GM_setValue: 'readonly',
                GM_addStyle: 'readonly',
                GM_notification: 'readonly',
                GM_xmlhttpRequest: 'readonly',
                GM_info: 'readonly',
                GM_listValues: 'readonly',
                // External libraries loaded via @require
                Cookies: 'readonly',
                saveAs: 'readonly',
            },
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
            'eqeqeq': ['warn', 'always', { null: 'ignore' }],
            'no-var': 'off',
        },
    },
];
