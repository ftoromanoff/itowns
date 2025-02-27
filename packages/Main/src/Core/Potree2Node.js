/*
============
== POTREE ==
============

http://potree.org

Copyright (c) 2011-2020, Markus Schütz
All rights reserved.

    Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

    1. Redistributions of source code must retain the above copyright notice, this
list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation
and/or other materials provided with the distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

    The views and conclusions contained in the software and documentation are those
of the authors and should not be interpreted as representing official policies,
    either expressed or implied, of the FreeBSD Project.
 */

import * as THREE from 'three';
import PointCloudNode from 'Core/PointCloudNode';

// Create an A(xis)A(ligned)B(ounding)B(ox) for the child `childIndex` of one aabb.
// (PotreeConverter protocol builds implicit octree hierarchy by applying the same
// subdivision algo recursively)
const dHalfLength = new THREE.Vector3();

const NODE_TYPE = {
    NORMAL: 0,
    LEAF: 1,
    PROXY: 2,
};

class Potree2Node extends PointCloudNode {
    constructor(numPoints = 0, childrenBitField = 0, layer) {
        super(numPoints, layer);
        this.childrenBitField = childrenBitField;
        this.id = '';
        this.depth = 0;
        this.baseurl = layer.source.baseurl;
    }

    get octreeIsLoaded() {
        return !(this.childrenBitField && this.children.length === 0);
    }

    get url() {
        return `${this.baseurl}/octree.bin`;
    }

    add(node, indexChild) {
        super.add(node, indexChild);
        node.id = this.id + indexChild;
        node.depth = this.depth + 1;
    }

    createChildAABB(childNode, childIndex) {
        // Code inspired from potree
        childNode._bbox.copy(this._bbox);
        this._bbox.getCenter(childNode._bbox.max);
        dHalfLength.copy(childNode._bbox.max).sub(this._bbox.min);

        if (childIndex === 1) {
            childNode._bbox.min.z += dHalfLength.z;
            childNode._bbox.max.z += dHalfLength.z;
        } else if (childIndex === 3) {
            childNode._bbox.min.z += dHalfLength.z;
            childNode._bbox.max.z += dHalfLength.z;
            childNode._bbox.min.y += dHalfLength.y;
            childNode._bbox.max.y += dHalfLength.y;
        } else if (childIndex === 0) {
            //
        } else if (childIndex === 2) {
            childNode._bbox.min.y += dHalfLength.y;
            childNode._bbox.max.y += dHalfLength.y;
        } else if (childIndex === 5) {
            childNode._bbox.min.z += dHalfLength.z;
            childNode._bbox.max.z += dHalfLength.z;
            childNode._bbox.min.x += dHalfLength.x;
            childNode._bbox.max.x += dHalfLength.x;
        } else if (childIndex === 7) {
            childNode._bbox.min.add(dHalfLength);
            childNode._bbox.max.add(dHalfLength);
        } else if (childIndex === 4) {
            childNode._bbox.min.x += dHalfLength.x;
            childNode._bbox.max.x += dHalfLength.x;
        } else if (childIndex === 6) {
            childNode._bbox.min.y += dHalfLength.y;
            childNode._bbox.max.y += dHalfLength.y;
            childNode._bbox.min.x += dHalfLength.x;
            childNode._bbox.max.x += dHalfLength.x;
        }
    }

    getCenter() {
        // for potree we send the point use as origin for the data
        // ie the min corner of the bbox
        this.center = this._bbox.min;
    }

    networkOptions(byteOffset, byteSize) {
        const first = byteOffset;
        const last = first + byteSize - 1n;

        // When we specify 'multipart/byteranges' on headers request it trigger a preflight request
        // Actually github doesn't support it https://github.com/orgs/community/discussions/24659
        // But if we omit header parameter, github seems to know it's a 'multipart/byteranges' request (thanks to 'Range' parameter)
        const networkOptions = {
            ...this.layer.source.networkOptions,
            headers: {
                ...this.layer.source.networkOptions.headers,
                ...(this.url.startsWith('https://raw.githubusercontent.com') ? {} : { 'content-type': 'multipart/byteranges' }),
                Range: `bytes=${first}-${last}`,
            },
        };

        return networkOptions;
    }

    async load() {
        // Query octree if we don't have children potreeNode yet.
        if (!this.octreeIsLoaded) {
            await this.loadOctree();
        }

        this.getCenter();

        return this.layer.source.fetcher(this.url, this.networkOptions(this.byteOffset, this.byteSize))
            .then(file => this.layer.source.parser(file, {
                in: {
                    source: this.layer.source,
                    bbox: this._bbox,
                    numPoints: this.numPoints,
                },
                out: {
                    ...this.layer,
                    center: this.center,
                },
            }))
            .then((data) => {
                this.loaded = true;
                this.loading = false;
                return data.geometry;
            });
    }

    async loadOctree() {
        if (this.loaded || this.loading) {
            return;
        }
        this.loading = true;
        return (this.nodeType === NODE_TYPE.PROXY) ? this.loadHierarchy() : Promise.resolve();
    }

    async loadHierarchy() {
        const hierarchyPath = `${this.baseurl}/hierarchy.bin`;
        const buffer = await this.layer.source.fetcher(hierarchyPath, this.networkOptions(this.hierarchyByteOffset, this.hierarchyByteSize));
        this.parseHierarchy(buffer);
    }

    parseHierarchy(buffer) {
        const view = new DataView(buffer);

        const bytesPerNode = 22;
        const numNodes = buffer.byteLength / bytesPerNode;

        const stack = [];
        stack.push(this);

        for (let indexNode = 0; indexNode < numNodes; indexNode++) {
            const current = stack.shift();
            const offset = indexNode * bytesPerNode;

            const type = view.getUint8(offset + 0);
            const childMask = view.getUint8(offset + 1);
            const numPoints = view.getUint32(offset + 2, true);
            const byteOffset = view.getBigInt64(offset + 6, true);
            const byteSize = view.getBigInt64(offset + 14, true);

            if (current.nodeType === NODE_TYPE.PROXY) {
                // replace proxy with real node
                current.byteOffset = byteOffset;
                current.byteSize = byteSize;
                current.numPoints = numPoints;
            } else if (type === NODE_TYPE.PROXY) {
                // load proxy
                current.hierarchyByteOffset = byteOffset;
                current.hierarchyByteSize = byteSize;
                current.numPoints = numPoints;
            } else {
                // load real node
                current.byteOffset = byteOffset;
                current.byteSize = byteSize;
                current.numPoints = numPoints;
            }

            if (current.byteSize === 0n) {
                // workaround for issue potree/potree#1125
                // some inner nodes erroneously report >0 points even though have 0 points
                // however, they still report a byteSize of 0, so based on that we now set node.numPoints to 0
                current.numPoints = 0;
            }

            current.nodeType = type;

            if (current.nodeType === NODE_TYPE.PROXY) {
                continue;
            }

            for (let childIndex = 0; childIndex < 8; childIndex++) {
                const childExists = ((1 << childIndex) & childMask) !== 0;

                if (!childExists) {
                    continue;
                }

                const child = new Potree2Node(numPoints, childMask, this.layer);
                child._quaternion = this._quaternion;
                child._position = this._position;
                child.spacing = current.spacing / 2;

                current.add(child, childIndex);
                stack.push(child);
            }
        }
    }
}

export default Potree2Node;
