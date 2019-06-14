/**
 * A 2d array of bits.
 */
class BitTable {
    /**
     * @param {!Uint8Array} buf
     * @param {!int} w
     * @param {!int} h
     */
    constructor(buf, w, h) {
        if (buf.length !== w * h) {
            throw new Error('buf.length !== w * h');
        }
        this.buf = buf;
        this.w = w;
        this.h = h;
    }

    /**
     * @param {!Array.<!int|!boolean>} rows
     * @returns {!BitTable}
     */
    static fromRows(...rows) {
        if (rows.length === 0) {
            throw new Error('rows.length === 0');
        }
        let h = rows.length;
        let w = rows[0].length;
        let buf = new Uint8Array(h * w);
        let k = 0;
        for (let row of rows) {
            if (row.length !== w) {
                throw new Error('row.length !== w');
            }
            for (let e of row) {
                buf[k] = e ? 1 : 0;
                k++;
            }
        }
        return new BitTable(buf, w, h);
    }

    /**
     * @returns {!BitTable}
     */
    copy() {
        return new BitTable(
            new Uint8Array(this.buf),
            this.w,
            this.h);
    }

    /**
     * @param {!int} w
     * @param {!int} h
     * @returns {!BitTable}
     */
    static zeros(w, h) {
        let buf = new Uint8Array(w * h);
        return new BitTable(buf, w, h);
    }

    /**
     * @param {!int|undefined=undefined} start
     * @param {!int|undefined=undefined} stop
     * @returns {!BitTable}
     */
    sliceRows(start=undefined, stop=undefined) {
        if (start === undefined) {
            start = 0;
        }
        if (stop === undefined) {
            stop = this.h;
        }
        return new BitTable(this.buf.slice(start*this.w, stop*this.w), this.w, stop - start);
    }

    /**
     * @param {!int} target_row
     * @param {!int} source_row
     */
    ixorRowToFrom(target_row, source_row) {
        let dst = this.w * target_row;
        let src = this.w * source_row;
        for (let col = 0; col < this.w; col++) {
            this.buf[dst + col] ^= this.buf[src + col];
        }
    }

    /**
     * @param {!int} row
     * @param {!int=} start
     * @returns {!Uint8Array}
     */
    row(row, start=0) {
        return this.buf.slice(
            this.w * row + start,
            this.w * (row + 1));
    }

    /**
     * @param {!int} col
     * @param {!int=} start
     * @returns {!Uint8Array}
     */
    col(col, start=0) {
        let result = new Uint8Array(this.h - start);
        for (let row = start; row < this.h; row++) {
            result[row - start] = this.get(row, col);
        }
        return result;
    }

    /**
     * @param {!int} row
     * @param {!int} col
     * @returns {!boolean}
     */
    get(row, col) {
        return this.buf[row * this.w + col] !== 0;
    }

    /**
     * @param {!int} row
     * @param {!int} col
     * @param {!boolean} val
     */
    set(row, col, val) {
        this.buf[row * this.w + col] = val ? 1 : 0;
    }

    /**
     * @param {!object} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        if (!(other instanceof BitTable)) {
            return false;
        }
        if (other.w !== this.w || other.h !== this.h) {
            return false;
        }
        for (let k = 0; k < this.buf.length; k++) {
            if (this.buf[k] !== other.buf[k]) {
                return false;
            }
        }
        return true;
    }

    toString() {
        let out = '';
        let k = 0;
        for (let row = 0; row < this.h; row++) {
            if (row > 0) {
                out += '\n'
            }
            for (let col = 0; col < this.w; col++) {
                out += this.buf[k] ? '1' : '0';
                k++;
            }
        }
        return out;
    }

    /**
     * @returns {!BitTable}
     */
    gaussianEliminatedMod2() {
        let out = this.copy();

        let h = this.h;
        let w = this.w;
        let next_row = 0;
        for (let col = 0; col < w; col++) {
            // Locate pivot.
            let row = first_non_zero_index(out.col(col, next_row));
            if (row === undefined) {
                continue;
            }
            row += next_row;

            // Eliminate column entry in other rows.
            for (let row2 = 0; row2 < h; row2++) {
                if (out.get(row2, col) && row !== row2) {
                    out.ixorRowToFrom(row2, row);
                }
            }

            // Keep it sorted.
            if (row !== next_row) {
                out.ixorRowToFrom(next_row, row);
                out.ixorRowToFrom(row, next_row);
                out.ixorRowToFrom(next_row, row);
            }
            next_row += 1;
        }
        return out;
    }
}

/**
 * @param {!Uint8Array} items
 * @returns {!int|undefined}
 */
function first_non_zero_index(items) {
    for (let i = 0; i < items.length; i++) {
        if (items[i] !== 0) {
            return i;
        }
    }
    return undefined;
}

export {BitTable}
