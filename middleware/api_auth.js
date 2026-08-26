const crypto = require('crypto');

/* Can declare middleware w/ function keyword decl or function expression (const middleware = (req, res) => {})
    either works. */
async function job_scheduler_authentication(req, res, next) {
    /* Check the auth token, hash it, and then compare with the .env hashed version. */
    const authHeader = req.headers["authorization"];
    let error;

    if (!authHeader) {
        error = 'Unauthorized: Missing Authorization header'
        console.error(error);
        return res.status(401).json({ error });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        error = 'Unauthorized: Authentication format must be Bearer <key>';
        console.error(error);
        return res.status(401).json({ error });
    }
    
    const clientRawKey = parts[1];

    const clientHash = crypto.createHash('sha256').update(clientRawKey).digest('hex');
    const serverHash = process.env.JOB_SCHEDULER_API_KEY_HASH;
    
    if (!serverHash) {
        error = "Security Alert: JOB_SCHEDULER_API_KEY_HASH is not set in environment variables!";
        console.error(error);
        return res.status(500).json({ error });
    }

    /* Convert to buffers for a constant-time comparison to prevent timing attacks.

        If we used standard javascript string comparison, the way it works is that the engine compares
        the strings character by character until a mismatch occurs. Hackers can hit our endpoint millions
        of times, measuring the milliseconds it takes to return, and figure out our API key this way.

        By converting them into raw byte buffers and comparing via timingSafeEqual, the cpu will not stop
        comparing even if a mismatch character is found along the way. This creates constant-time 
        comparison, mitigating timing attacks. */
    const clientBuffer = Buffer.from(clientHash, 'hex');
    const serverBuffer = Buffer.from(serverHash, 'hex');

    if (clientBuffer.length === serverBuffer.length && crypto.timingSafeEqual(clientBuffer, serverBuffer)) {
        return next();
    }

    error = 'Unauthorized: Invalid API Key';
    console.error(error)
    res.status(401).json({ error });
}

module.exports = {
    job_scheduler_authentication
}