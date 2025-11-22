const fs = require('fs').promises;
const path = require('path');

let projectBasePath = null;
let serverPort = process.env.PORT || 3000;

const AppHost = {
    initialize: async (config, dependencies) => {
        console.log('[AppHost] Initializing...');
        if (config.PROJECT_BASE_PATH) {
            projectBasePath = config.PROJECT_BASE_PATH;
        }
        if (config.PORT) {
            serverPort = config.PORT;
        }
    },

    processToolCall: async (args) => {
        console.log('[AppHost] Processing tool call:', args);
        const { appName, htmlContent } = args;

        if (!appName || !htmlContent) {
            throw new Error(JSON.stringify({
                status: "error",
                message: "Missing required arguments: appName and htmlContent"
            }));
        }

        // Sanitize appName to prevent directory traversal
        const safeAppName = appName.replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeAppName) {
             throw new Error(JSON.stringify({
                status: "error",
                message: "Invalid appName. Use only alphanumeric characters, underscores, and hyphens."
            }));
        }

        // Ensure projectBasePath is set, otherwise fallback to a safe relative path
        const baseDir = projectBasePath || path.resolve(__dirname, '../../');
        const appsDir = path.join(baseDir, 'GeneratedApps');
        
        try {
            await fs.mkdir(appsDir, { recursive: true });
            const filePath = path.join(appsDir, `${safeAppName}.html`);
            await fs.writeFile(filePath, htmlContent, 'utf8');

            // Construct the URL. Assuming the server is running on localhost.
            // If accessed remotely, the client might need to replace localhost with the server IP.
            const appUrl = `http://localhost:${serverPort}/apps/${safeAppName}.html`;

            return {
                status: "success",
                message: `App deployed successfully!`,
                appUrl: appUrl,
                appName: safeAppName
            };
        } catch (error) {
            console.error('[AppHost] Error deploying app:', error);
            throw new Error(JSON.stringify({
                status: "error",
                message: `Failed to deploy app: ${error.message}`
            }));
        }
    }
};

module.exports = AppHost;