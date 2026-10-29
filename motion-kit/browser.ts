import { chromium, type Browser } from 'playwright-core';

/**
 * Chrome as installed on this machine, or the Chromium at `CHROMIUM_PATH`.
 * Never downloads a browser.
 */
export const launchBrowser = async (): Promise<Browser> => {
    const executablePath = process.env.CHROMIUM_PATH;

    try {
        return await chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' });
    } catch (error) {
        throw new Error(
            executablePath
                ? `motion-kit: no browser starts at CHROMIUM_PATH=${executablePath}. ` +
                      'Point it at a Chrome or Chromium executable, or unset it to use the installed Chrome.'
                : 'motion-kit: Google Chrome is not installed where Playwright looks for it. ' +
                      'Install Chrome, or set CHROMIUM_PATH to a Chrome or Chromium executable.',
            { cause: error },
        );
    }
};
