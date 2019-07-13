import {GeneralMap} from "src/base/GeneralMap.js";
import {equate} from "src/base/Equate.js";
import {padSetTo, QuantumStatement} from "src/sim/QuantumProgram.js";
import {NODES} from "src/nodes/All.js";


class EdgeActions extends QuantumStatement {
    /**
     * @param {!GeneralMap.<!int, !string>|!Map.<!int, !string>} changes Qubit to edge action kind.
     * @param {!boolean} useRootNodeEdgeAction
     */
    constructor(changes, useRootNodeEdgeAction) {
        super();
        this.changes = changes;
        this.useRootNodeEdgeAction = useRootNodeEdgeAction;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return (other instanceof EdgeActions &&
            equate(this.changes, other.changes) &&
            this.useRootNodeEdgeAction === other.useRootNodeEdgeAction);
    }

    /**
     * @param {!string} kind
     * @returns {*}
     * @private
     */
    _action(kind) {
        let nodeKind = NODES.map.get(kind);
        if (this.useRootNodeEdgeAction) {
            return nodeKind.nodeRootEdgeAction;
        }
        return nodeKind.edgeAction;
    }

    writeQasm(statements) {
        for (let [qubit, kind] of this.changes.entries()) {
            let ops = this._action(kind).qasmGates;
            for (let op of ops) {
                statements.push(`${op} q[${qubit}];`);
            }
        }
    }

    writeQuirk(init, cols) {
        let col = [];
        for (let [qubit, kind] of this.changes.entries()) {
            let quirkGate = this._action(kind).quirkGate;
            padSetTo(col, 1, qubit, quirkGate);
        }
        cols.push(col);
    }

    interpret(sim, out) {
        for (let [qubit, kind] of this.changes.entries()) {
            this._action(kind).sim(sim, qubit);
        }
    }
}

export {EdgeActions}
