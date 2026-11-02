'use strict';

// Runtime discovery and OS necessities only. This is secret minimization, not a sandbox.
function executionEnv(source = process.env) {
    const names = new Set([
        'path', 'pathext', 'systemroot', 'windir', 'comspec', 'temp', 'tmp',
        'userprofile', 'homedrive', 'homepath', 'home', 'localappdata', 'appdata',
        'programfiles', 'programfiles(x86)', 'programdata', 'number_of_processors',
        'processor_architecture', 'lang', 'lc_all', 'rustup_home', 'cargo_home',
    ]);
    return Object.fromEntries(Object.entries(source).filter(([key]) => names.has(key.toLowerCase())));
}
module.exports = { executionEnv };