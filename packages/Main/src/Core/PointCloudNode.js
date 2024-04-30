import * as THREE from 'three';
import OBB from 'Renderer/OBB';

const size = new THREE.Vector3();
const position = new THREE.Vector3();
const translation = new THREE.Vector3();

/**
 * @property {number} numPoints - The number of points in this node.
 * @property {PointCloudSource} source - Data source of the node.
 * @property {PointCloudNode[]} children - The children nodes of this node.
 * @property {OBB} voxelOBB - The node cubique obb.
 * @property {OBB} clampOBB - The cubique obb clamped to zmin and zmax.
 * @property {number} sse - The sse of the node set at an nitial value of -1.
 */
class PointCloudNode extends THREE.EventDispatcher {
    constructor(numPoints = 0, source) {
        super();

        this.numPoints = numPoints;

        this.source = source;

        this.children = [];
        this.voxelOBB = new OBB();
        this.clampOBB = new OBB();
        this.sse = -1;
    }

    get pointSpacing() {
        return this.source.spacing / 2 ** this.depth;
    }

    get id() {
        throw new Error('In extended PointCloudNode, you have to implement the getter id!');
    }

    add(node, indexChild) {
        this.children.push(node);
        node.parent = this;
        this.createChildAABB(node, indexChild);
    }

    /**
     * Create an (A)xis (A)ligned (B)ounding (B)ox for the given node given
     * `this` is its parent.
     * @param {CopcNode} childNode - The child node
     */
    createChildAABB(childNode) {
        // initialize the child node obb
        childNode.voxelOBB.copy(this.voxelOBB);
        const voxelBBox = this.voxelOBB.box3D;
        const childVoxelBBox = childNode.voxelOBB.box3D;

        // factor to apply, based on the depth difference (can be > 1)
        const f = 2 ** (childNode.depth - this.depth);

        // size of the child node bbox (Vector3), based on the size of the
        // parent node, and divided by the factor
        voxelBBox.getSize(size).divideScalar(f);

        // position of the parent node, if it was at the same depth as the
        // child, found by multiplying the tree position by the factor
        position.copy(this).multiplyScalar(f);

        // difference in position between the two nodes, at child depth, and
        // scale it using the size
        translation.subVectors(childNode, position).multiply(size);

        // apply the translation to the child node bbox
        childVoxelBBox.min.add(translation);

        // use the size computed above to set the max
        childVoxelBBox.max.copy(childVoxelBBox.min).add(size);

        // get a clamped bbox from the voxel bbox
        childNode.clampOBB.copy(childNode.voxelOBB);

        const childClampBBox = childNode.clampOBB.box3D;

        if (childClampBBox.min.z < this.layer.zmax) {
            childClampBBox.max.z = Math.min(childClampBBox.max.z, this.layer.zmax);
        }
        if (childClampBBox.max.z > this.layer.zmin) {
            childClampBBox.min.z = Math.max(childClampBBox.min.z, this.layer.zmin);
        }

        childNode.voxelOBB.matrixWorldInverse = this.voxelOBB.matrixWorldInverse;
        childNode.clampOBB.matrixWorldInverse = this.clampOBB.matrixWorldInverse;
    }

    /**
     * Compute the center of the bounding box in the local referential
     * @returns {THREE.Vector3}
     */
    getCenter() {
        const centerBbox = new THREE.Vector3();
        this.voxelOBB.box3D.getCenter(centerBbox);
        return centerBbox.applyMatrix4(this.clampOBB.matrixWorld);
    }

    load() {
        return this.source.fetcher(this.url, this.source.networkOptions)
            .then(file => this.source.parse(file, {
                in: this.source,
                out: { origin },
            }));
    }

    findCommonAncestor(node) {
        if (node.depth == this.depth) {
            if (node.id == this.id) {
                return node;
            } else if (node.depth != 0) {
                return this.parent.findCommonAncestor(node.parent);
            }
        } else if (node.depth < this.depth) {
            return this.parent.findCommonAncestor(node);
        } else {
            return this.findCommonAncestor(node.parent);
        }
    }
}

export default PointCloudNode;
