import assert from 'assert';
import { HttpsProxyAgent } from 'https-proxy-agent';
// import View from 'Core/View';
// import GlobeView from 'Core/Prefab/GlobeView';
// import Coordinates from 'Core/Geographic/Coordinates';
import CopcSource from 'Source/CopcSource';
// import EntwinePointTileSource from 'Source/EntwinePointTileSource';
// import EntwinePointTileLayer from 'Layer/EntwinePointTileLayer';
// import EntwinePointTileNode from 'Core/EntwinePointTileNode';
// import LASParser from 'Parser/LASParser';
// import sinon from 'sinon';
import Fetcher from 'Provider/Fetcher';
// import Renderer from './bootstrap';

// import eptFile from '../data/entwine/ept.json';
// import eptHierarchyFile from '../data/entwine/ept-hierarchy/0-0-0-0.json';

// LASParser need to be mocked instead of calling it
// LASParser.enableLazPerf('./examples/libs/laz-perf');

// const baseurl = 'https://raw.githubusercontent.com/iTowns/iTowns2-sample-data/master/pointclouds/entwine';
const copcUrl = 'https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz';

// const eptSsAuthority = JSON.parse(eptFile);
// eptSsAuthority.srs = {
//     wkt: 'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]],PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["X",EAST],AXIS["Y",NORTH],EXTENSION["PROJ4","+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs"],AUTHORITY["EPSG","3857"]]',
// };

// const resources = {
//     [`${baseurl}`]: JSON.parse(eptFile),
//     // 'withoutAutority/ept.json': eptSsAuthority,
//     // [`${baseurl}/ept-hierarchy/0-0-0-0.json`]: JSON.parse(eptHierarchyFile),
// };

describe('COPC', function () {
    let source;
    let copcData;
    // const networkOptions = process.env.HTTPS_PROXY ? { agent: new HttpsProxyAgent(process.env.HTTPS_PROXY) } : {};
    it('fetch binaries', async function () {
        const networkOptions = process.env.HTTPS_PROXY ? { agent: new HttpsProxyAgent(process.env.HTTPS_PROXY) } : {};
        copcData = await Fetcher.arrayBuffer(copcUrl, networkOptions);
    });
    // let stubFetcherJson;
    // let stubFetcherArrayBuf;

    // before(function () {
    //     // stubFetcherJson = sinon.stub(Fetcher, 'json')
    //     //     .callsFake(url => Promise.resolve(resources[url]));
    //     stubFetcherArrayBuf = sinon.stub(Fetcher, 'arrayBuffer')
    //         .callsFake(() => Promise.resolve(new ArrayBuffer()));
    //     // currently no test on data fetched...

    //     LASParser.enableLazPerf('./examples/libs/laz-perf');
    // });

    // after(async function () {
    //     stubFetcherJson.restore();
    //     stubFetcherArrayBuf.restore();
    //     await LASParser.terminate();
    // });

    describe('Copc Source', function () {
        describe('retrieving crs from srs information', function () {
            it('skip', function () {
                if (!copcData) { this.skip(); }
            });
            it('No srs authority', function (done) {
                // if (!copcData) { this.skip(); }
                source = new CopcSource({
                    url: copcUrl,
                    // networkOptions,
                });
                source.whenReady
                    .then(() => {
                        assert.equal(source.crs, 'WGS 84 / Pseudo-Mercator');
                        done();
                    }).catch(done);
            });
            // it('With srs authority', (done) => {
            //     source = new CopcSource({
            //         url: 'https://raw.githubusercontent.com/iTowns/iTowns2-sample-data/master/pointclouds/entwine',
            //     });
            //     source.whenReady
            //         .then(() => {
            //             assert.equal(source.crs, 'EPSG:3857');
            //             done();
            //         }).catch(done);
            // });
        });
    });

    // describe('Layer', function () {
    //     let renderer;
    //     let placement;
    //     let view;
    //     let layer;
    //     let context;

    //     before(function (done) {
    //         renderer = new Renderer();
    //         placement = { coord: new Coordinates('EPSG:4326', 0, 0), range: 250 };
    //         view = new GlobeView(renderer.domElement, placement, { renderer });
    //         layer = new EntwinePointTileLayer('test', { source }, view);

    //         context = {
    //             camera: view.camera,
    //             engine: view.mainLoop.gfxEngine,
    //             scheduler: view.mainLoop.scheduler,
    //             geometryLayer: layer,
    //             view,
    //         };

    //         View.prototype.addLayer.call(view, layer)
    //             .then(() => {
    //                 done();
    //             }).catch(done);
    //     });

    //     it('pre updates and finds the root', () => {
    //         const element = layer.preUpdate(context, new Set([layer]));
    //         assert.strictEqual(element.length, 1);
    //         assert.deepStrictEqual(element[0], layer.root);
    //     });

    //     it('tries to update on the root and fails', function () {
    //         layer.update(context, layer, layer.root);
    //         assert.strictEqual(layer.root.promise, undefined);
    //     });

    //     it('tries to update on the root and succeeds', function (done) {
    //         view.controls.lookAtCoordinate({
    //             coord: source.center,
    //             range: 250,
    //         }, false)
    //             .then(() => {
    //                 layer.update(context, layer, layer.root);
    //                 layer.root.promise
    //                     .then(() => {
    //                         done();
    //                     });
    //             }).catch(done);
    //     });

    //     it('post updates', function () {
    //         layer.postUpdate(context, layer);
    //     });
    // });

    // describe('Node', function () {
    //     let root;
    //     before(function () {
    //         const layer = { source: { url: 'http://server.geo', extension: 'laz' } };
    //         root = new EntwinePointTileNode(0, 0, 0, 0, layer, 4000);
    //         root.bbox.setFromArray([1000, 1000, 1000, 0, 0, 0]);

    //         root.add(new EntwinePointTileNode(1, 0, 0, 0, layer, 3000));
    //         root.add(new EntwinePointTileNode(1, 0, 0, 1, layer, 3000));
    //         root.add(new EntwinePointTileNode(1, 0, 1, 1, layer, 3000));

    //         root.children[0].add(new EntwinePointTileNode(2, 0, 0, 0, layer, 2000));
    //         root.children[0].add(new EntwinePointTileNode(2, 0, 1, 0, layer, 2000));
    //         root.children[1].add(new EntwinePointTileNode(2, 0, 1, 3, layer, 2000));
    //         root.children[2].add(new EntwinePointTileNode(2, 0, 2, 2, layer, 2000));
    //         root.children[2].add(new EntwinePointTileNode(2, 0, 3, 3, layer, 2000));

    //         root.children[0].children[0].add(new EntwinePointTileNode(3, 0, 0, 0, layer, 1000));
    //         root.children[0].children[0].add(new EntwinePointTileNode(3, 0, 1, 0, layer, 1000));
    //         root.children[1].children[0].add(new EntwinePointTileNode(3, 0, 2, 7, layer, 1000));
    //         root.children[2].children[0].add(new EntwinePointTileNode(3, 0, 5, 4, layer, 1000));
    //         root.children[2].children[1].add(new EntwinePointTileNode(3, 1, 6, 7, layer));
    //     });

    //     it('finds the common ancestor of two nodes', () => {
    //         let ancestor = root.children[2].children[1].children[0].findCommonAncestor(root.children[2].children[0].children[0]);
    //         assert.deepStrictEqual(ancestor, root.children[2]);

    //         ancestor = root.children[0].children[0].children[0].findCommonAncestor(root.children[0].children[0].children[1]);
    //         assert.deepStrictEqual(ancestor, root.children[0].children[0]);

    //         ancestor = root.children[0].children[1].findCommonAncestor(root.children[2].children[1].children[0]);
    //         assert.deepStrictEqual(ancestor, root);

    //         ancestor = root.children[1].findCommonAncestor(root.children[1].children[0].children[0]);
    //         assert.deepStrictEqual(ancestor, root.children[1]);

    //         ancestor = root.children[2].children[0].findCommonAncestor(root.children[2]);
    //         assert.deepStrictEqual(ancestor, root.children[2]);
    //     });
    // });
});
