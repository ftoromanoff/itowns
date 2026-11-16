import assert from 'assert';
import * as sinon from 'sinon';
import PointCloudNode, { buildVoxelKey } from 'Core/PointCloudNode';
import { Box3, Vector3 } from 'three';

const crs = 'EPSG:4978';

function newPtCloudNodeWithKey(source, depth, numPoints, key) {
    const node = new PointCloudNode(source, depth, numPoints);
    node.x = key.x;
    node.y = key.y;
    node.z = key.z;

    node.voxelKey = buildVoxelKey(depth, ...Object.values(key));
    return node;
}

describe('Point Cloud Node', function () {
    const bounds = [0, 0, 0, 10, 10, 10];
    const zmin = 1;
    const zmax = 9;
    const source = {
        spacing: 10,
        crs,
        bounds,
        zmin,
        zmax,
    };

    describe('constructor', () => {
        it('instanciate a node', () => {
            const depth = 2;
            const numPoints = 5000;
            const node = new PointCloudNode(source, depth, numPoints);
            assert.ok(node instanceof PointCloudNode);
            assert.equal(node.numPoints, numPoints);
        });
    });

    describe('getters', () => {
        let root;
        before('instanciate a root node', function () {
            root = new PointCloudNode(source, 0, -1);
        });

        it('get hierarchyIsLoaded', () => {
            assert.equal(root.hierarchyIsLoaded, false);
        });

        it('get id', () => {
            const depth = 0;
            const x = 5;
            const y = 12;
            const z = 2;
            const node = newPtCloudNodeWithKey(source, depth, -1, { x, y, z });
            assert.equal(node.id, buildVoxelKey(depth, x, y, z));
        });
    });

    describe('methods', () => {
        let root;
        let rootWithId;
        let child;
        let childWithId;
        const boundsBox3 = new Box3().setFromArray(source.bounds);
        let spy;
        let stub;
        before('instanciate nodes', function () {
            root = new PointCloudNode(source, 0, 0);
            root.children = [];
            rootWithId = new newPtCloudNodeWithKey(source, 0, 0, { x: 0, y: 0, z: 0 });

            child = new PointCloudNode(source, 1, 0);
            childWithId = new newPtCloudNodeWithKey(source, 1, 0, { x: 0, y: 1, z: 0 });
        });

        afterEach('restore spies', function () {
            Object.keys(spy).forEach((s) => {
                spy[s].restore();
            });
            if (stub) {
                Object.keys(stub).forEach((s) => {
                    stub[s].restore();
                });
            }
        });

        it('subdivide()', async () => {
            rootWithId.loadHierarchy = () => Promise.resolve({});
            stub = {
                createChildren: sinon.stub(rootWithId, 'createChildren')
                    .callsFake(() => { rootWithId.children = []; }),
            };

            spy = {
                loadHierarchy: sinon.spy(rootWithId, 'loadHierarchy'),
            };

            await rootWithId.subdivide();
            assert.ok(spy.loadHierarchy.calledOnce, 'loadHierarchy not called once');
            assert.ok(stub.createChildren.calledOnce, 'createChildren not called once');
            assert.deepStrictEqual(rootWithId.children, []);

            // children are created only once
            await rootWithId.subdivide();
            assert.equal(spy.loadHierarchy.callCount, 2);
            assert.equal(stub.createChildren.callCount, 1);
        });

        it('createChildren()', () => {
            rootWithId.findAndCreateChild = (d, x, y, z) => {
                rootWithId.children.push(`child_${d}-${x}-${y}-${z}`);
            };

            spy = {
                findAndCreateChild: sinon.spy(rootWithId, 'findAndCreateChild'),
            };

            rootWithId.createChildren();
            assert.equal(spy.findAndCreateChild.callCount, 8);

            assert.equal(rootWithId.children.length, 8);
        });

        it('load()', async () => {
            root.loadHierarchy = () => Promise.resolve({});
            spy = {
                loadHierarchy: sinon.spy(root, 'loadHierarchy'),
            };
            root.fetcher = () => Promise.resolve('fetched');
            source.parser = buffer => Promise.resolve(`${buffer} and parsed`);
            const data = await root.load(crs);
            assert.ok(spy.loadHierarchy.calledOnce);
            assert.equal(data, 'fetched and parsed');
        });

        it('add()', () => {
            const mock = sinon.mock(child);
            mock.expects('setOBBes').once();
            root.add(child);

            mock.verify();
            assert.equal(root.children.length, 1);
            assert.deepStrictEqual(child.parent, root);
        });

        it('setOBBes()', () => {
            assert.deepStrictEqual(child.parent, root, 'root not declared as parent');
            child.source = source;

            stub = {
                computeBBoxFromParent: sinon.stub(child, 'computeBBoxFromParent')
                    .callsFake(() => boundsBox3),
            };

            child.setOBBes();

            assert.deepStrictEqual(child.voxelOBB.natBox, boundsBox3, 'voxelOBB.natBox');
            assert.deepStrictEqual(child.voxelOBB.box3D.min, new Vector3().fromArray(source.bounds.slice(0, 3)), 'voxelOBB.box3D.min');
            assert.deepStrictEqual(child.voxelOBB.box3D.max, new Vector3().fromArray(source.bounds.slice(3, 6)), 'voxelOBB.box3D.max');

            assert.deepStrictEqual(child.clampOBB.box3D.min, new Vector3().fromArray([...source.bounds.slice(0, 2), source.zmin]));
            assert.deepStrictEqual(child.clampOBB.box3D.max, new Vector3().fromArray([...source.bounds.slice(3, 5), source.zmax]));
        });

        it('computeBBoxFromParent()', () => {
            childWithId.parent = rootWithId;
            assert.deepStrictEqual(childWithId.parent, rootWithId, 'root not declared as parent');
            rootWithId.voxelOBB.natBox = boundsBox3;
            const childVoxelBBox = childWithId.computeBBoxFromParent();

            const boundsXMin = source.bounds[0];
            const boundsXMax = source.bounds[3];
            const valueToTest = [boundsXMin, (boundsXMin + boundsXMax) * 0.5, boundsXMax];
            Object.values(childVoxelBBox.min).forEach((v) => {
                assert.ok(valueToTest.includes(v));
            });
            Object.values(childVoxelBBox.max).forEach((v) => {
                assert.ok(valueToTest.includes(v));
            });
        });

        describe('findCommonAncestor()', () => {
            let root;
            before('instantiate the nodes', function () {
                function newPtCloudNodeWithId(depth, numPoints, key) {
                    const node = newPtCloudNodeWithKey(source, depth, numPoints, key);
                    node.setOBBes = () => {};
                    return node;
                }

                root = newPtCloudNodeWithId(0, 4000, { x: 0, y: 0, z: 0 });

                root.add(newPtCloudNodeWithId(1, 3000, { x: 0, y: 0, z: 0 }));
                root.add(newPtCloudNodeWithId(1, 3000, { x: 0, y: 0, z: 1 }));
                root.add(newPtCloudNodeWithId(1, 3000, { x: 0, y: 1, z: 1 }));

                root.children[0].add(newPtCloudNodeWithId(2, 2000, { x: 0, y: 0, z: 0 }));
                root.children[0].add(newPtCloudNodeWithId(2, 2000, { x: 0, y: 1, z: 0 }));
                root.children[1].add(newPtCloudNodeWithId(2, 2000, { x: 0, y: 1, z: 3 }));
                root.children[2].add(newPtCloudNodeWithId(2, 2000, { x: 0, y: 2, z: 2 }));
                root.children[2].add(newPtCloudNodeWithId(2, 2000, { x: 0, y: 3, z: 3 }));

                root.children[0].children[0].add(newPtCloudNodeWithId(3, 2000, { x: 0, y: 0, z: 0 }));
                root.children[0].children[0].add(newPtCloudNodeWithId(3, 2000, { x: 0, y: 1, z: 0 }));
                root.children[1].children[0].add(newPtCloudNodeWithId(3, 2000, { x: 0, y: 2, z: 7 }));
                root.children[2].children[0].add(newPtCloudNodeWithId(3, 2000, { x: 0, y: 5, z: 4 }));
                root.children[2].children[1].add(newPtCloudNodeWithId(3, 0, { x: 1, y: 6, z: 7 }));
            });

            let ancestor;
            it('cousins => grand parent', () => {
                ancestor = root.children[2].children[1].children[0].findCommonAncestor(root.children[2].children[0].children[0]);
                assert.deepStrictEqual(ancestor, root.children[2]);
            });

            it('brothers => parent', () => {
                ancestor = root.children[0].children[0].children[0].findCommonAncestor(root.children[0].children[0].children[1]);
                assert.deepStrictEqual(ancestor, root.children[0].children[0]);
            });

            it('grand child and grand grand child => root', () => {
                ancestor = root.children[0].children[1].findCommonAncestor(root.children[2].children[1].children[0]);
                assert.deepStrictEqual(ancestor, root);
            });

            it('parent and child => parent', () => {
                ancestor = root.children[1].findCommonAncestor(root.children[1].children[0].children[0]);
                assert.deepStrictEqual(ancestor, root.children[1]);
            });

            it('child and parent => parent', () => {
                ancestor = root.children[2].children[0].findCommonAncestor(root.children[2]);
                assert.deepStrictEqual(ancestor, root.children[2]);
            });
        });
    });
});
