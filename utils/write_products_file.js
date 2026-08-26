const { writeFile, rename } = require('fs/promises');

/* Serializes `requests` and atomically overwrites `targetPath` (writes to a
    sibling .tmp file first, then renames over the original). A plain
    writeFile straight to products.json could leave it truncated/half-written
    if the process dies mid-write -- a real risk here since the very next
    step is handing that file to another program to read. */
async function writeProductsFile(targetPath, requests) {
    const tmpPath = `${targetPath}.tmp`;
    const contents = JSON.stringify(requests, null, 2) + '\n';
    await writeFile(tmpPath, contents, 'utf8');
    await rename(tmpPath, targetPath);
}

module.exports = {
    writeProductsFile
};
