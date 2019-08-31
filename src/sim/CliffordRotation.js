/**
 * Single qubit clifford operations represented by how they act on X and Z observables.
 */

import {Matrix} from "src/base/Matrix.js";
import {Complex} from "src/base/Complex.js";

const X_AXIS = 0;
const Z_AXIS = 1;
const Y_AXIS = 2;

/**
 * @param {!int} axis
 */
function nextAxis(axis) {
    return (axis + 2) % 3;
}

/**
 * A single-qubit Clifford operation, up to global phase.
 */
class CliffordRotation {
    /**
     * @param {!int} x_axis Which output axis the X axis is sent to by this operation.
     * @param {!int} x_sign The sign of the output axis that the X axis is sent to by this operation.
     * @param {!int} z_axis Which output axis the Z axis is sent to by this operation.
     * @param {!int} z_sign The sign of the output axis that the Z axis is sent to by this operation.
     */
    constructor(x_axis, x_sign, z_axis, z_sign) {
        if (x_axis === z_axis) {
            throw new Error('x_axis === z_axis');
        }
        if (!Number.isInteger(x_axis) || x_axis < 0 || x_axis > 2) {
            throw new Error(`Bad x_axis: ${x_axis}`)
        }
        if (!Number.isInteger(z_axis) || z_axis < 0 || z_axis > 2) {
            throw new Error(`Bad x_axis: ${z_axis}`)
        }
        if (!Number.isInteger(x_sign) || Math.abs(x_sign) !== 1) {
            throw new Error(`Bad x_sign: ${x_sign}`)
        }
        if (!Number.isInteger(z_sign) || Math.abs(z_sign) !== 1) {
            throw new Error(`Bad z_sign: ${z_sign}`)
        }
        this.x_axis = x_axis;
        this.x_sign = x_sign;
        this.z_axis = z_axis;
        this.z_sign = z_sign;
    }

    /**
     * Lists all 24 of the single-qubit Clifford rotations.
     * @returns {!Array.<!CliffordRotation>}
     */
    static all() {
        let result = [];
        for (let x_axis of [X_AXIS, Y_AXIS, Z_AXIS]) {
            for (let z_axis of [(x_axis + 1) % 3, (x_axis + 2) % 3]) {
                for (let x_sign of [+1, -1]) {
                    for (let z_sign of [+1, -1]) {
                        result.push(new CliffordRotation(x_axis, x_sign, z_axis, z_sign));
                    }
                }
            }
        }
        return result;
    }

    /**
     * @returns {!int}
     */
    get y_axis() {
        return 3 - this.x_axis - this.z_axis;
    }

    /**
     * @returns {!int}
     */
    get y_sign() {
        let rev = this.z_axis === nextAxis(this.x_axis) ? -1 : +1;
        return this.x_sign * this.z_sign * rev;
    }

    /**
     * @returns {!Matrix}
     */
    matrix() {
        let cur = this;
        let total = Matrix.identity(2);

        // Get X axis into the correct place.
        switch (cur.x_axis) {
            case Y_AXIS:
                cur = CliffordRotation.Hxy.times(cur);
                total = total.times(_Hxy_matrix);
                break;
            case Z_AXIS:
                cur = CliffordRotation.Hxz.times(cur);
                total = total.times(_Hxz_matrix);
                break;
        }

        // Get Z axis into the correct place.
        if (cur.z_axis === Y_AXIS) {
            cur = CliffordRotation.Hyz.times(cur);
            total = total.times(_Hyz_matrix);
        }

        // Adjust Pauli frame.
        if (cur.x_sign === -1) {
            total = total.times(Matrix.square(1, 0, 0, -1));
        }
        if (cur.z_sign === -1) {
            total = total.times(Matrix.square(0, 1, 1, 0));
        }

        return total;
    }

    /**
     * @param {!int} in_axis
     * @returns {!int}
     */
    xyz_axis(in_axis) {
        switch (in_axis) {
            case X_AXIS: return this.x_axis;
            case Y_AXIS: return this.y_axis;
            case Z_AXIS: return this.z_axis;
            default: throw new Error(`Bad axis: ${in_axis}`);
        }
    }

    /**
     * @param {!int} out_axis
     * @returns {!int}
     */
    inv_xyz_axis(out_axis) {
        if (this.x_axis === out_axis) {
            return X_AXIS;
        }
        if (this.z_axis === out_axis) {
            return Z_AXIS;
        }
        return Y_AXIS;
    }

    /**
     * @param {!int} in_axis
     * @returns {!int}
     */
    xyz_sign(in_axis) {
        switch (in_axis) {
            case X_AXIS: return this.x_sign;
            case Y_AXIS: return this.y_sign;
            case Z_AXIS: return this.z_sign;
            default: throw new Error(`Bad axis: ${in_axis}`);
        }
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return (other instanceof CliffordRotation &&
            other.x_axis === this.x_axis &&
            other.x_sign === this.x_sign &&
            other.z_axis === this.z_axis &&
            other.z_sign === this.z_sign);
    }

    /**
     * @returns {!CliffordRotation}
     */
    sqrt() {
        if ((this.x_axis === X_AXIS) !== (this.z_axis === Z_AXIS)) {
            throw new Error(`<${this}> doesn't have a square root (that is a Clifford rotation).`)
        }

        // Period 3 cycles.
        if (this.x_axis !== X_AXIS) {
            return this.square();
        }

        // Paulis.
        let d = (this.x_sign === -1 ? 2 : 0) + (this.z_sign === -1 ? 1 : 0);
        return [CliffordRotation.I, CliffordRotation.Sx, CliffordRotation.Sz, CliffordRotation.Sy][d];
    }

    /**
     * @returns {!Array.<!CliffordRotation>}
     */
    allSqrts() {
        if ((this.x_axis === X_AXIS) !== (this.z_axis === Z_AXIS)) {
            return [];
        }

        // Period 3 cycles.
        if (this.x_axis !== X_AXIS) {
            return [this.square()];
        }

        // Paulis.
        let d = (this.x_sign === -1 ? 2 : 0) + (this.z_sign === -1 ? 1 : 0);
        return [
            () => CliffordRotation.all().filter(e => e.square().isEqualTo(CliffordRotation.I)),
            () => [CliffordRotation.Sx, CliffordRotation.Sx.inv()],
            () => [CliffordRotation.Sz, CliffordRotation.Sz.inv()],
            () => [CliffordRotation.Sy, CliffordRotation.Sy.inv()],
        ][d]();
    }

    /**
     * @returns {!CliffordRotation}
     */
    square() {
        return this.times(this);
    }

    /**
     * @param {!CliffordRotation} other
     * @returns {!CliffordRotation}
     */
    times(other) {
        return new CliffordRotation(
            this.xyz_axis(other.x_axis),
            this.xyz_sign(other.x_axis) * other.x_sign,
            this.xyz_axis(other.z_axis),
            this.xyz_sign(other.z_axis) * other.z_sign);
    }

    /**
     * @returns {!CliffordRotation}
     */
    inv() {
        let x = this.inv_xyz_axis(X_AXIS);
        let z = this.inv_xyz_axis(Z_AXIS);
        return new CliffordRotation(
            x,
            this.xyz_sign(x),
            z,
            this.xyz_sign(z));
    }

    /**
     * @returns {!string}
     */
    toString() {
        let sign = s => s === -1 ? '-' : '+';
        let xyz = s => 'XZY'[s];
        return `Clifford(X to ${sign(this.x_sign)}${xyz(this.x_axis)}, ` +
            `Z to ${sign(this.z_sign)}${xyz(this.z_axis)}, ` +
            `Y to ${sign(this.y_sign)}${xyz(this.y_axis)})`;
    }
}

CliffordRotation.I = new CliffordRotation(X_AXIS, +1, Z_AXIS, +1);
CliffordRotation.X = new CliffordRotation(X_AXIS, +1, Z_AXIS, -1);
CliffordRotation.Y = new CliffordRotation(X_AXIS, -1, Z_AXIS, -1);
CliffordRotation.Z = new CliffordRotation(X_AXIS, -1, Z_AXIS, +1);
CliffordRotation.Hxz = new CliffordRotation(Z_AXIS, +1, X_AXIS, +1);
CliffordRotation.Hyz = new CliffordRotation(X_AXIS, -1, Y_AXIS, +1);
CliffordRotation.Hxy = new CliffordRotation(Y_AXIS, +1, Z_AXIS, -1);
CliffordRotation.Sx = new CliffordRotation(X_AXIS, +1, Y_AXIS, -1);
CliffordRotation.Sy = new CliffordRotation(Z_AXIS, -1, X_AXIS, +1);
CliffordRotation.Sz = new CliffordRotation(Y_AXIS, +1, Z_AXIS, +1);
CliffordRotation.XyzCycle = new CliffordRotation(Y_AXIS, +1, X_AXIS, +1);
CliffordRotation.H = CliffordRotation.Hxz;
CliffordRotation.S = CliffordRotation.Sz;

let _s = Math.sqrt(0.5);
let _Hxy_matrix = new Matrix(2, 2, new Float64Array([0, 0, _s, -_s, _s, _s, 0, 0]));
let _Hxz_matrix = new Matrix(2, 2, new Float64Array([_s, 0, _s, 0, _s, 0, -_s, 0]));
let _Hyz_matrix = new Matrix(2, 2, new Float64Array([_s, 0, 0, -_s, 0, _s, -_s, 0]));

export {CliffordRotation, X_AXIS, Z_AXIS, Y_AXIS}
