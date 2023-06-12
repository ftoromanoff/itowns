const assert = require('assert');

describe('misc_instancing', function _() {
    let pageLoaded;
    const title = this.fullTitle();

    it("should load 'misc_instancing' page", async function _it() {
        pageLoaded = await loadExample('examples/misc_instancing.html', title);
        assert.ok(pageLoaded);
    });

    it('should load the trees and lights objects', async function _it() {
        if (pageLoaded) {
            const objects = await page.evaluate(
                () => {
                    const res = [];
                    if (view.scene) {
                        const objects3d = view.scene;
                        objects3d.traverse((obj) => {
                            if (obj.isInstancedMesh) {
                                if (obj.parent && obj.parent.layer) {
                                    res.push(obj.parent.layer.name);
                                }
                            }
                        });
                    }
                    return res;
                });
            assert.ok(objects.indexOf('lights') >= 0);
            assert.ok(objects.indexOf('trees') >= 0);
        } else {
            this.skip();
        }
    });
});
