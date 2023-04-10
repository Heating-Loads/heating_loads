//Import Railbelt Bounds

var railbelt =  ee.Geometry.Polygon(
    [[[-154.11035798210284, 65.58222247757196],
      [-154.11035798210284, 58.99095243977402],
      [-142.50879548210284, 58.99095243977402],
      [-142.50879548210284, 65.58222247757196]]], null, false);
      

// AK state boundaries
var alaska_bounds = ee.FeatureCollection('projects/earthengine-legacy/assets/projects/sat-io/open-datasets/geoboundaries/HPSCGS-ADM1')
                  .filter(ee.Filter.eq('shapeName', 'Alaska' )).geometry();


// Import FABDEM (Forest And Buildings removed Copernicus 30m DEM) - for elevation
var fabdem = ee.ImageCollection("projects/sat-io/open-datasets/FABDEM")
          .filter(ee.Filter.bounds(alaska_bounds));
var ground_elevation = fabdem.mosaic();

// Import GLO--with buildings
var glo30 = ee.ImageCollection("projects/sat-io/open-datasets/GLO-30")
          .filter(ee.Filter.bounds(alaska_bounds));
var building_elevation = glo30.mosaic().setDefaultProjection('EPSG:3857',null,30);

// building elevation less ground elevation band
var building_height = building_elevation.subtract(ground_elevation)

//Import building outlines
var buildings = ee.FeatureCollection("users/edtrochim/OSM_building_AK").filter(ee.Filter.bounds(alaska_bounds));
print(buildings.first())
      
//Import zip codes data
var zipCodes= ee.FeatureCollection('TIGER/2010/ZCTA5').filter(ee.Filter.bounds(alaska_bounds));
print(zipCodes.limit(1))


//Create function to join buildings and zipcodes
var buildingsZip = zipCodes.map(function(feat){
feat = ee.Feature(feat);
var name = feat.get('ZCTA5CE10');
var buildingsFilt = buildings.filterBounds(feat.geometry()).map(function(zone){
return ee.Feature(zone).set('zip_code', name).set('zip_group',ee.String(name).slice(0,4));
});
return buildingsFilt;
}).flatten();

print(buildingsZip.limit(1))

//Create a list of distinct zip codes
var uniq_zip = buildingsZip.aggregate_array('zip_group').distinct()
print(uniq_zip.length())   


//Function to batch buildings

//A batch of buildings is identified by zip_group (first 3 or 4 digits of zip code)
// The following function is being applied over every zip_group
var batch_export = uniq_zip.map(function(zip){

//Filter buildings by a zip_group
var batch = buildingsZip.filter(ee.Filter.eq('zip_group', zip));

//Apply reduce region over climate data using the filtered building collection
var height_reduced = building_height.reduceRegions({collection: batch,  // (if some other image needs to be reduced, replace climate with that image name)
                                       reducer: ee.Reducer.mean().setOutputs(['height']),
                                       scale: 30
                                       });
// This function computes a feature's geometry area and adds it as a property.
var addArea = function(feature){
  return feature.set({'areasq_ft': feature.geometry().area().multiply(10.7639)})
}

var building_area = height_reduced.map(addArea)
// .filter(
//     #ee.Filter.bounds(geometry_bounds.geometry())
//     ee.Filter.bounds(geometry_bounds)
// )

//Return the filtered feature collection with mean                                        
return building_area


});

//We get one feature collection per zip_group and iterating the above function for every zip_group gives a list of feature collections

//Combine list of feature collections into one large collection
var exp = ee.FeatureCollection(batch_export).flatten()

//Export feature collection to csv
Export.table.toDrive({
collection: exp,
description:  'height_reduced_with_area',
folder: 'GEE_Output',
fileFormat: 'CSV' })




















