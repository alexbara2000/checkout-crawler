const {firefox} = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')()

async function initialize(sharedConfig) {
    let ff_path = process.env.FOXHOUND_PATH;
    if (ff_path === undefined) {
        console.error(`Env variable FOXHOUND_PATH needs to be set`);
        process.exit(1);
    }
    const ff_config = {
        executablePath: ff_path
    };
    firefox.use(stealth)
    return await firefox.launch(Object.assign(ff_config, sharedConfig));
}

module.exports = {
    initialize,
};
