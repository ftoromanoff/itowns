import PointCloudNode from 'Core/PointCloudNode';
import type { EntwinePointTileSource, CopcSource } from 'Main';

abstract class LasNodeBase<S extends CopcSource | EntwinePointTileSource> extends PointCloudNode<S> {
    /** X position within the octree */
    x: number;
    /** Y position within the octree */
    y: number;
    /** Z position within the octree */
    z: number;

    constructor(
        depth: number,
        x: number, y: number, z: number,
        numPoints: number,
        source: S,
    ) {
        super(source, depth, numPoints);

        this.x = x;
        this.y = y;
        this.z = z;
    }

    override get networkOptions(): RequestInit {
        return this.source.networkOptions;
    }
}

export default LasNodeBase;
