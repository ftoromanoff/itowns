import LayerUpdateState from 'Layer/LayerUpdateState';
import ObjectRemovalHelper from 'Process/ObjectRemovalHelper';
import handlingError from 'Process/handlerNodeError';
import { Coordinates } from '@itowns/geographic';
import { geoidLayerIsVisible } from 'Layer/GeoidLayer';
import { applyStyle, rebuildMeshTopology } from 'Converter/Feature2Mesh';

const coord = new Coordinates('EPSG:4326', 0, 0, 0);

export default {
    update(context, layer, node) {
        if (!node.parent && node.children.length) {
            // if node has been removed dispose three.js resource
            ObjectRemovalHelper.removeChildrenAndCleanupRecursively(layer, node);
            return;
        }
        if (!node.visible) {
            return;
        }

        if (node.layerUpdateState[layer.id] === undefined) {
            node.layerUpdateState[layer.id] = new LayerUpdateState();
        } else if (!node.layerUpdateState[layer.id].canTryUpdate()) {
            // toggle visibility features
            let topologyUpdated = false;
            node.link[layer.id]?.forEach((f) => {
                f.layer.object3d.add(f);
                f.meshes.position.z = geoidLayerIsVisible(layer.parent) ? node.geoidHeight : 0;
                f.meshes.updateMatrixWorld();
                const updateTopology = f.styleTopologyVersion !== (layer._styleTopologyVersion ?? 0);
                if (updateTopology) {
                    rebuildMeshTopology(f, layer.style);
                    f.styleTopologyVersion = layer._styleTopologyVersion ?? 0;
                    topologyUpdated = true;
                    return;
                }
                const updateColor = f.styleColorVersion !== (layer._styleColorVersion ?? 0);
                const updatePosition = f.stylePositionVersion !== (layer._stylePositionVersion ?? 0);
                if (updateColor || updatePosition) {
                    const buffersToUpdate = [];
                    if (updateColor) { buffersToUpdate.push('color'); }
                    if (updatePosition) { buffersToUpdate.push('position'); }
                    for (const mesh of f.meshes.children) {
                        applyStyle(
                            mesh,
                            f.collection,
                            layer.style,
                            buffersToUpdate,
                        );
                    }
                    f.styleColorVersion = layer._styleColorVersion ?? 0;
                    f.stylePositionVersion = layer._stylePositionVersion ?? 0;
                }
            });
            if (topologyUpdated) {
                context.view.notifyChange(layer, true);
            }
            return;
        }

        let extentsDestination = node.getExtentsByProjection(layer.source.crs);
        let zoomDest;
        if (!extentsDestination) {
            extentsDestination = [node.extent]; // of type Extent
            zoomDest = node.level;
        } else {
            zoomDest = extentsDestination[0].zoom;
        }

        // if (this.id === 'VTBuilding') {
        //     console.log('FeatureProcessing', layer, zoomDest);
        // }

        // check if it's tile level is equal to display level layer.
        // TO DO updata at all level asked
        if ((zoomDest < layer.zoom.min || zoomDest > layer.zoom.max) ||
        // if (zoomDest != layer.zoom.min ||
        // check if there's data in extent tile.
            !this.source.hasData(node.extent) ||
        // In FileSource case, check if the feature center is in extent tile.
            (layer.source.isFileSource && !node.extent.isPointInside(layer.source.extent.center(coord)))) {
        // if not, there's not data to add at this tile.
            node.layerUpdateState[layer.id].noMoreUpdatePossible();
            return;
        }

        node.layerUpdateState[layer.id].newTry();

        const command = {
            layer,
            extentsSource: extentsDestination,
            view: context.view,
            requester: node,
        };

        return context.scheduler.execute(command).then((featureMeshes) => {
            node.layerUpdateState[layer.id].noMoreUpdatePossible();

            featureMeshes.forEach((featureMesh) => {
                if (featureMesh) {
                    node.link[layer.id] = node.link[layer.id] || [];
                    featureMesh.as(context.view.referenceCrs);
                    featureMesh.meshes.position.z = geoidLayerIsVisible(layer.parent) ? node.geoidHeight : 0;
                    featureMesh.updateMatrixWorld();

                    if (layer.onMeshCreated) {
                        layer.onMeshCreated(featureMesh, context);
                    }

                    if (!node.parent) {
                        // TODO: Clean cache needs a refactory, because it isn't really efficient and used
                        ObjectRemovalHelper.removeChildrenAndCleanupRecursively(layer, featureMesh);
                    } else {
                        if (node.parent.link[layer.id]?.length > 0) {
                            // console.log('parent a nettoyer', layer.object3d.children.length, ':', node.parent.link[layer.id].length, 'node to supp');
                            /* test visibility */
                            // node.parent.link[layer.id].forEach(fM => fM.visibility = 0);
                            /* test remove */
                            // node.parent.link[layer.id].forEach((fM) => {
                            //     console.log(fM);
                            //     // fM.geometry.dispose();
                            //     // fM.material.dispose();
                            //     // layer.object3d.remove(fM);
                            //     // ObjectRemovalHelper.cleanup(fM);
                            // });
                            // node.parent.link[layer.id] = [];
                            /* test opacity*/
                            node.parent.link[layer.id].forEach((fM) => {
                                // console.log(fM);
                                fM.meshes.traverse((child) => {
                                    if (child.isMesh) {
                                        // console.log(child);
                                        child.material.transparent = true;
                                        child.material.opacity = 0;
                                        // child.material.needsUpdate = true;
                                    }
                                });
                            });
                            // console.log(layer.id, node.parent);
                            // console.log('-> END parent a nettoyer', layer.object3d.children, ':', node.parent.link[layer.id]);
                        }
                        // console.log('FeatureProcessing', node.parent.link[layer.id], layer.id);
                        // console.log('FeatureProcessing', layer.object3d);
                        layer.object3d.add(featureMesh);
                        featureMesh.meshes.traverse((child) => {
                            if (child.isMesh) {
                                // child.material.transparent = false;
                                child.material.opacity = 1;
                            }
                        });
                        node.link[layer.id].push(featureMesh);
                    }
                    featureMesh.layer = layer;
                } else {
                    // TODO: verify if it's possible the featureMesh is undefined.
                    node.layerUpdateState[layer.id].failure(1, true);
                }
            });
        },
        err => handlingError(err, node, layer, node.level, context.view));
    },
};
