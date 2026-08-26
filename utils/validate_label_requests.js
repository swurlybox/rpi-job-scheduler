const MAX_REQUESTS = 200;
const MAX_QUANTITY = 10000;
const SKU_PATTERN = /^[A-Za-z0-9._-]+$/;

/* Thrown when the request body doesn't match the LabelRequest[] shape the
    print-label workflow's --file option expects. `details` lists every
    failing row, not just the first, so a caller can fix a whole batch in
    one round trip. */
class ValidationError extends Error {
    constructor(message, details = []) {
        super(message);
        this.name = 'ValidationError';
        this.details = details;
    }
}

/* Validates and normalizes a raw JSON body into the array of LabelRequest
    objects data/products.json needs:
        { sku: string, quantity: number, format?, title?, asin?, thermalWidthMm?, thermalHeightMm? }
    (see Seller-Central-Label-Printing-Automation/src/types.ts).

    Returns the normalized array on success. Throws ValidationError on any
    failure -- the caller is expected to turn that into a 400 response. */
function validateLabelRequests(body) {
    if (!Array.isArray(body)) {
        throw new ValidationError('Request body must be a JSON array of { sku, quantity } objects.');
    }

    if (body.length === 0) {
        throw new ValidationError('Request body must contain at least one { sku, quantity } entry.');
    }

    if (body.length > MAX_REQUESTS) {
        throw new ValidationError(`Request body must contain ${MAX_REQUESTS} entries or fewer (got ${body.length}).`);
    }

    const requests = [];
    const details = [];

    body.forEach((entry, i) => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            details.push(`[${i}] must be an object.`);
            return;
        }

        /* Reject prototype-pollution-flavored keys outright, even though we
            only ever read the known fields below. */
        if (Object.prototype.hasOwnProperty.call(entry, '__proto__') ||
            Object.prototype.hasOwnProperty.call(entry, 'constructor')) {
            details.push(`[${i}] contains a disallowed key.`);
            return;
        }

        const sku = typeof entry.sku === 'string' ? entry.sku.trim() : '';
        if (!sku) {
            details.push(`[${i}] is missing "sku" (must be a non-empty string -- JSON doesn't support bare hex/numeric SKU literals, quote it).`);
            return;
        }
        if (!SKU_PATTERN.test(sku)) {
            details.push(`[${i}] "sku" contains characters outside A-Z, a-z, 0-9, '.', '_', '-'.`);
            return;
        }

        const quantity = Number(entry.quantity);
        if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
            details.push(`[${i}] "quantity" must be a positive integer no greater than ${MAX_QUANTITY}.`);
            return;
        }

        const normalized = { sku, quantity };

        if (entry.format !== undefined) {
            if (typeof entry.format !== 'string' || !entry.format) {
                details.push(`[${i}] "format" must be a non-empty string when present.`);
                return;
            }
            normalized.format = entry.format;
        }

        if (entry.title !== undefined) {
            if (typeof entry.title !== 'string') {
                details.push(`[${i}] "title" must be a string when present.`);
                return;
            }
            normalized.title = entry.title;
        }

        if (entry.asin !== undefined) {
            if (typeof entry.asin !== 'string') {
                details.push(`[${i}] "asin" must be a string when present.`);
                return;
            }
            normalized.asin = entry.asin;
        }

        for (const field of ['thermalWidthMm', 'thermalHeightMm']) {
            if (entry[field] !== undefined) {
                const n = Number(entry[field]);
                if (!Number.isFinite(n) || n <= 0) {
                    details.push(`[${i}] "${field}" must be a positive number when present.`);
                    return;
                }
                normalized[field] = n;
            }
        }

        requests.push(normalized);
    });

    if (details.length > 0) {
        throw new ValidationError('Request body failed validation.', details);
    }

    return requests;
}

module.exports = {
    validateLabelRequests,
    ValidationError
};
