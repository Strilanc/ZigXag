class ZxNodeKind {
    /**
     * @param {!{
     *     id: !string,
     *     description: !string,
     *     contentDrawer: !function(ctx: !CanvasRenderingContext2D),
     *     diagramReps: (undefined|!Array.<!string>),
     *     hotkeys: !Array.<!string>,
     *     hotkeyShiftMask: (undefined|!boolean),
     *     mouseHotkey: (undefined|!string),
     *     allowedDegrees: !Array.<!int>,
     *     fixedPoints: !function(degree: !int): !Array.<!PauliProduct>,
     *     tensor: !function(dim: !int): !Matrix,
     *     edgeAction: !{
     *         quirkGate: null|!string,
     *         qasmGates: null|!Array.<!string>,
     *         sim: !function(sim: !ChpSimulator, qubit: !int),
     *         matrix: null|!int|!Matrix,
     *     },
     *     nodeRootEdgeAction?: !{
     *         quirkGate: null|!string,
     *         qasmGates: null|!Array.<!string>,
     *         sim: !function(sim: !ChpSimulator, qubit: !int),
     *         matrix: null|!int|!Matrix,
     *     },
     *     nodeMeasurer: !function(
     *         outProgram: !QuantumProgram,
     *         totalQubits: !int,
     *         qubitIds: !Array.<!int>,
     *     ): !Array.<!TransformedMeasurement>,
     *     postSelectStabilizer?: undefined|!string
     * }} attributes
     */
    constructor(attributes) {
        this.id = attributes.id;
        this.description = attributes.description;
        this.contentDrawer = attributes.contentDrawer;
        this.diagramReps = attributes.diagramReps || [this.id];
        this.hotkeys = attributes.hotkeys;
        this.hotkeyShiftMask = attributes.hotkeyShiftMask;
        this.mouseHotkey = attributes.mouseHotkey;
        this.allowedDegrees = attributes.allowedDegrees;
        this.fixedPoints = attributes.fixedPoints;
        this.tensor = attributes.tensor;
        this.edgeAction = attributes.edgeAction;
        this.nodeRootEdgeAction = attributes.nodeRootEdgeAction || attributes.edgeAction;
        this.nodeMeasurer = attributes.nodeMeasurer;
        this.postSelectStabilizer = attributes.postSelectStabilizer || undefined;
    }
}

class TransformedMeasurement {
    /**
     * @param {!PauliProduct} originalStabilizer
     * @param {!QubitAxis} postselectionControlAxis
     * @param {!QubitAxis} measurementAxis
     */
    constructor(originalStabilizer, measurementAxis, postselectionControlAxis) {
        this.originalStabilizer = originalStabilizer;
        this.measurementAxis = measurementAxis;
        this.postselectionControlAxis = postselectionControlAxis;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return (other instanceof TransformedMeasurement &&
            this.measurementAxis.isEqualTo(other.measurementAxis) &&
            this.originalStabilizer.isEqualTo(other.originalStabilizer) &&
            this.postselectionControlAxis.isEqualTo(other.postselectionControlAxis));
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `originalStabilizer: ${this.originalStabilizer}
postselectionControlAxis: ${this.postselectionControlAxis}
measurementAxis: ${this.measurementAxis}`;
    }
}

export {TransformedMeasurement, ZxNodeKind}
