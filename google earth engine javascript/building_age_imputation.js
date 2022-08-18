//goal: building age for each footprint in state of Alaska/Railbelt --> asset

//code to pull in wsf for building age, then check null ages 
//against dynamic world and wsf 2019 datasets before imputing year built-- 
      // values: post-2019 ('2020'), 2019, or pre-1985 ('2014')

// AK state boundaries
var AK_geom = ee.FeatureCollection('projects/earthengine-legacy/assets/projects/sat-io/open-datasets/geoboundaries/HPSCGS-ADM1')
                      .filter(ee.Filter.eq('shapeName', 'Alaska' )).geometry();

// Railbelt geom
var state_geom =  
    ee.Geometry.Polygon(
        [[[-154.11035798210284, 65.58222247757196],
          [-154.11035798210284, 58.99095243977402],
          [-142.50879548210284, 58.99095243977402],
          [-142.50879548210284, 65.58222247757196]]], null, false);


// Import OSM building footprints
var osm_buildings = ee.FeatureCollection('users/edtrochim/OSM_building_AK')
                      .filter(ee.Filter.bounds(state_geom));

//print(osm_buildings.size())
  //109296 building outlines on railbelt

// Import World Settlements Footprint Data (1985-2015)
var wsf = ee.ImageCollection("projects/sat-io/open-datasets/WSF/WSF_EVO").select('b1')
            .filter(ee.Filter.bounds(state_geom));

// Import Updated WSF layer (2019)
  // Note: values of 255 mean that there was a settlement
var wsf2019 = ee.ImageCollection("projects/sat-io/open-datasets/WSF/WSF_2019")
              .filterBounds(state_geom)
              .max().eq(255);

// Import Dynamic World dataset (June 2015- present)
    // Note: If the likelihood is greater than 0.5 then it's probably a building. 
    // If the wsf2019 is 0 and the dynamic world is 1 then the building was built 
    // after 2019. Everything else is pre-1985.
var dyworld = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
                .filter(ee.Filter.bounds(state_geom))
                .select('built').max().gte(0.5);

// print(dyworld.select('built'))

// Pulling building age from WSF
var wsf_building_age = wsf.reduce(ee.Reducer.min()).reduceRegions({
        'collection': osm_buildings,
        'reducer': ee.Reducer.mean().setOutputs(['age']),
        'scale': 10,
})

// print(wsf_building_age.aggregate_array('age').distinct())
  //tells us that there are fractional year values
  
// get buildings with age as null in OG WSF
var wsf_building_null_age = wsf_building_age.filter(
                                          ee.Filter.eq('age', null))
//print(wsf_building_null_age.size())
  //43523

var wsf_building_not_null_age = wsf_building_age.filter(
                            ee.Filter.notNull(wsf_building_age.first().propertyNames())
                            )
//print(wsf_building_not_null_age.size())
  //65773

// Pulling building age from 2019 WSF
var wsf2019_building_age = wsf2019.reduce(ee.Reducer.min()).reduceRegions({
        'collection': wsf_building_null_age,
        'reducer': ee.Reducer.mean().setOutputs(['age']),
        'scale': 10,
})


var wsf2019_building_null_age = wsf2019_building_age.filter(ee.Filter.eq('age', null))

// print(wsf2019_building_null_age.size())
// 18188 null age buildings in wsf2019 on railbelt

//if 'age' == 1 then update to 2019
var age_update_2019 = function(feature){
  return feature.set({age: 2019})
};
var wsf2019_building_not_null_age = wsf2019_building_age.filter(ee.Filter.eq('age', 1))
var wsf2019_building_not_null_age = wsf2019_building_not_null_age.map(age_update_2019);

//print(wsf2019_building_not_null_age.size())
// 25335- number of of buildings that were assigned year 2019

// Pulling building age from Dynamic World
var dyworld_building_age = dyworld.reduceRegions({
        'collection': wsf2019_building_null_age,
        'reducer': ee.Reducer.mean().setOutputs(['age']),
        'scale': 10,
})

// if age > 0.5: assign building age of 2020
var age_update_2020 = function(feature){
  return feature.set({age: 2020})
};

//print(dyworld_building_age.size())
  //18188, all is well
  
var dyworld_building_age_2020 = dyworld_building_age.filter(ee.Filter.eq('age', 1))
var dyworld_building_age_2020 = dyworld_building_age_2020.map(age_update_2020);

// print(dyworld_building_age_2020.size())
  // 11350, no longer 11980
  
// if age <=0.5: assign building age of 1984
var age_update_1984 = function(feature){
  return feature.set({age: 1984})
};

var dyworld_building_age_1984 = dyworld_building_age.filter(ee.Filter.neq('age', 1))
var dyworld_building_age_1984 = dyworld_building_age_1984.map(age_update_1984);

// print(dyworld_building_age_1984.size())
 // 6838, no longer 6208


//############# Time to Combine ###############

// feature collections to merge
// dyworld_building_age_2020
// dyworld_building_age_1984
// wsf2019_building_not_null_age
// wsf_building_not_null_age


var final_building_ages = dyworld_building_age_2020.merge(dyworld_building_age_1984)
                                        .merge(wsf2019_building_not_null_age)
                                        .merge(wsf_building_not_null_age)

// print(final_building_ages.size())
  //109262, all good
  
// var test = final_building_ages.filter(ee.Filter.eq('age', null))

// print(test.size())
  // 0, all is well

//can round building age with ee.floor, but don't need to since we use cts years

Export.table.toAsset({
  collection: final_building_ages,
  description: 'railbelt_building_age',
  assetId: 'building_age_variables',
});


