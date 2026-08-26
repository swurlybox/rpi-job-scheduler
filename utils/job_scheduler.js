const util = require('node:util');
const child_process = require('child_process');
const path = require('path');

const execFile = util.promisify(child_process.execFile);

/* Directory Path is the absolute path to the directory where you want to execute the command.

    Returns {stdoutData, stderrData} as strings. Throws on an error.

    options.timeoutMs overrides the default 15s kill timeout -- some
    downstream programs (e.g. a Playwright-driven print job) legitimately
    run longer than that.
*/
async function exec_external_program(directory_path, command, args = [], options = {}) {
    /* For windows, set 'shell: true' makes this command work. On Linux it works fine without the shell property. */
    const execOptions = {
        cwd: path.resolve(directory_path),
        shell: true,
        timeout: options.timeoutMs ?? 15000
    };

    try {
        const { stdout, stderr } = await execFile(command, args, execOptions);

        /* Only when the program finishes, we'll send the response. This is how we synchronize the end of the
            program execution with the frontend that called the endpoint. */
        if (stderr) {
            console.warn(`[WARN] ${command} emitted errors: ${stderr}`);
        }

        return stdout.trim();
    } catch (error) {
        console.error(`[EXEC ERROR] Fail in ${directory_path} running ${command}:`, error.message);
        throw new Error('Internal task execution failed.');
    }
}

module.exports = {
    exec_external_program
}
