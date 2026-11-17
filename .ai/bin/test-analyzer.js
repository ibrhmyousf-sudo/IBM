const fs = require('fs');
const path = require('path');
const workspace = path.resolve(__dirname, '../../Modules');

const modules = fs.readdirSync(workspace).filter(d => fs.statSync(path.join(workspace, d)).isDirectory());
console.log(modules);
