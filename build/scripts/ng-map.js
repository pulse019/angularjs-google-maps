/** @module ngMap */
var ngMap = {
  services: {},
  directives: {}
};

/**
 * @ngdoc service
 * @name Attr2Options
 * @description 
 *   Converts tag attributes to options used by google api v3 objects, map, marker, polygon, circle, etc.
 */
ngMap.services.Attr2Options = function($parse, NavigatorGeolocation, GeoCoder) { 
  var SPECIAL_CHARS_REGEXP = /([\:\-\_]+(.))/g;
  var MOZ_HACK_REGEXP = /^moz([A-Z])/;  

  var camelCase = function(name) {
    return name.
      replace(SPECIAL_CHARS_REGEXP, function(_, separator, letter, offset) {
        return offset ? letter.toUpperCase() : letter;
      }).
      replace(MOZ_HACK_REGEXP, 'Moz$1');
  }

  var JSONize = function(str) {
    return str
      // wrap keys without quote with valid double quote
      .replace(/([\$\w]+)\s*:/g, function(_, $1){return '"'+$1+'":'})    
      // replacing single quote wrapped ones to double quote 
      .replace(/'([^']+)'/g, function(_, $1){return '"'+$1+'"'})         
  }

  var toOptionValue = function(input, options) {
    var output, key=options.key, scope=options.scope;
    try { // 1. Number?
      var num = Number(input);
      if (isNaN(num)) {
        throw "Not a number";
      } else  {
        output = num;
      }
    } catch(err) { 
      try { // 2.JSON?
        output = JSON.parse(JSONize(input));
        if (output instanceof Array) {
          var t1stEl = output[0];
          if (t1stEl.constructor == Object) { // [{a:1}] : not lat/lng ones
          } else if (t1stEl.constructor == Array) { // [[1,2],[3,4]] 
            output =  output.map(function(el) {
              return new google.maps.LatLng(el[0], el[1]);
            });
          } else if(!isNaN(parseFloat(t1stEl)) && isFinite(t1stEl)) {
            return new google.maps.LatLng(output[0], output[1]);
          }
        }
      } catch(err2) {
        // 3. Object Expression. i.e. LatLng(80,-49)
        if (input.match(/^[A-Z][a-zA-Z0-9]+\(.*\)$/)) {
          try {
            var exp = "new google.maps."+input;
            output = eval(exp); // TODO, still eval
          } catch(e) {
            output = input;
          } 
        // 4. Object Expression. i.e. MayTypeId.HYBRID 
        } else if (input.match(/^([A-Z][a-zA-Z0-9]+)\.([A-Z]+)$/)) {
          try {
            var matches = input.match(/^([A-Z][a-zA-Z0-9]+)\.([A-Z]+)$/);
            output = google.maps[matches[1]][matches[2]];
          } catch(e) {
            output = input;
          } 
        // 5. Object Expression. i.e. HYBRID 
        } else if (input.match(/^[A-Z]+$/)) {
          try {
            var capitializedKey = key.charAt(0).toUpperCase() + key.slice(1);
            output = google.maps[capitializedKey][input];
          } catch(e) {
            output = input;
          } 
        } else {
          output = input;
        }
      } // catch(err2)
    } // catch(err)
    return output;
  };

  var setDelayedGeoLocation = function(object, method, param, options) {
    options = options || {};
    var centered = object.centered || options.centered;
    var errorFunc = function() {
      console.log('error occurred while', object, method, param, options);
      var fallbackLocation = options.fallbackLocation || new google.maps.LatLng(0,0);
      object[method](fallbackLocation);
    };
    if (!param || param.match(/^current/i)) { // sensored position
      NavigatorGeolocation.getCurrentPosition().then(
        function(position) { // success
          var lat = position.coords.latitude;
          var lng = position.coords.longitude;
          var latLng = new google.maps.LatLng(lat,lng);
          object[method](latLng);
          if (centered) {
            object.map.setCenter(latLng);
          }
        },
        errorFunc
      );
    } else { //assuming it is address
      GeoCoder.geocode({address: param}).then(
        function(results) { // success
          object[method](results[0].geometry.location);
          if (centered) {
            object.map.setCenter(results[0].geometry.location);
          }
        },
        errorFunc
      );
    }
  };

  var observeAndSet = function(attrs, attrName, object) {
    attrs.$observe(attrName, function(val) {
      if (val) {
        console.log('observing ', object, attrName, val);
        var setMethod = camelCase('set-'+attrName);
        var optionValue = toOptionValue(val, {key: attrName});
        console.log('setting ', object, attrName, 'with value', optionValue);
        if (object[setMethod]) { //if set method does exist
          /* if an location is being observed */
          if (attrName.match(/center|position/) && 
            typeof optionValue == 'string') {
            setDelayedGeoLocation(object, setMethod, optionValue);
          } else {
            object[setMethod](optionValue);
          }
        }
      }
    });
  };

  return {
    /**
     * filters attributes by skipping angularjs methods $.. $$..
     * @memberof Attr2Options
     * @param {Hash} attrs tag attributes
     * @returns {Hash} filterd attributes
     */
    filter: function(attrs) {
      var options = {};
      for(var key in attrs) {
        if (!key.match(/^\$/)) {
          options[key] = attrs[key];
        }
      }
      return options;
    },


    /**
     * converts attributes hash to Google Maps API v3 options  
     * ```
     *  . converts numbers to number   
     *  . converts class-like string to google maps instance   
     *    i.e. `LatLng(1,1)` to `new google.maps.LatLng(1,1)`  
     *  . converts constant-like string to google maps constant    
     *    i.e. `MapTypeId.HYBRID` to `google.maps.MapTypeId.HYBRID`   
     *    i.e. `HYBRID"` to `google.maps.MapTypeId.HYBRID`  
     * ```
     * @memberof Attr2Options
     * @param {Hash} attrs tag attributes
     * @param {scope} scope angularjs scope
     * @returns {Hash} options converted attributess
     */
    getOptions: function(attrs, scope) {
      var options = {};
      for(var key in attrs) {
        if (attrs[key]) {
          if (key.match(/^on[A-Z]/)) { //skip events, i.e. on-click
            continue;
          } else if (key.match(/ControlOptions$/)) { // skip controlOptions
            continue;
          } else {
            options[key] = toOptionValue(attrs[key], {scope:scope, key: key});
          }
        } // if (attrs[key])
      } // for(var key in attrs)
      return options;
    },

    /**
     * converts attributes hash to scope-specific event function 
     * @memberof Attr2Options
     * @param {scope} scope angularjs scope
     * @param {Hash} attrs tag attributes
     * @returns {Hash} events converted events
     */
    getEvents: function(scope, attrs) {
      var events = {};
      var toLowercaseFunc = function($1){
        return "_"+$1.toLowerCase();
      };
      var eventFunc = function(attrValue) {
        var matches = attrValue.match(/([^\(]+)\(([^\)]*)\)/);
        var funcName = matches[1];
        var argsStr = matches[2].replace(/event[ ,]*/,'');  //remove string 'event'
        
        var args = scope.$eval("["+argsStr+"]");
        return function(event) {
          scope[funcName].apply(this, [event].concat(args));
        }
      }

      for(var key in attrs) {
        if (attrs[key]) {
          if (!key.match(/^on[A-Z]/)) { //skip if not events
            continue;
          }
          
          //get event name as underscored. i.e. zoom_changed
          var eventName = key.replace(/^on/,'');
          eventName = eventName.charAt(0).toLowerCase() + eventName.slice(1);
          eventName = eventName.replace(/([A-Z])/g, toLowercaseFunc);

          var attrValue = attrs[key];
          events[eventName] = new eventFunc(attrValue);
        }
      }
      return events;
    },

    /**
     * control means map controls, i.e streetview, pan, etc, not a general control
     * @memberof Attr2Options
     * @param {Hash} filtered filtered tag attributes
     * @returns {Hash} Google Map options
     */
    getControlOptions: function(filtered) {
      var controlOptions = {};
      if (typeof filtered != 'object')
        return false;

      for (var attr in filtered) {
        if (filtered[attr]) {
          if (!attr.match(/(.*)ControlOptions$/)) { 
            continue; // if not controlOptions, skip it
          }

          //change invalid json to valid one, i.e. {foo:1} to {"foo": 1}
          var orgValue = filtered[attr];
          var newValue = orgValue.replace(/'/g, '"');
          newValue = newValue.replace(/([^"]+)|("[^"]+")/g, function($0, $1, $2) {
            if ($1) {
              return $1.replace(/([a-zA-Z0-9]+?):/g, '"$1":');
            } else {
              return $2; 
            } 
          });
          try {
            var options = JSON.parse(newValue);
            for (var key in options) { //assign the right values
              if (options[key]) {
                var value = options[key];
                if (typeof value === 'string') {
                  value = value.toUpperCase();
                } else if (key === "mapTypeIds") {
                  value = value.map( function(str) {
                    return google.maps.MapTypeId[str.toUpperCase()];
                  });
                } 
                
                if (key === "style") {
                  var str = attr.charAt(0).toUpperCase() + attr.slice(1);
                  var objName = str.replace(/Options$/,'')+"Style";
                  options[key] = google.maps[objName][value];
                } else if (key === "position") {
                  options[key] = google.maps.ControlPosition[value];
                } else {
                  options[key] = value;
                }
              }
            }
            controlOptions[attr] = options;
          } catch (e) {
            console.error('invald option for', attr, newValue, e, e.stack);
          }
        }
      } // for

      return controlOptions;
    }, // function

    getAttrsToObserve : function(attrs) {
      var attrsToObserve = [];
      if (attrs["ng-repeat"] || attrs.ngRepeat) {  // if element is created by ng-repeat, don't observe any
      } else {
        for (var attrName in attrs) {
          var attrValue = attrs[attrName];
          if (attrValue && attrValue.match(/\{\{.*\}\}/)) { // if attr value is {{..}}
            console.log('setting attribute to observe', attrName, camelCase(attrName), attrValue);
            attrsToObserve.push(camelCase(attrName));
          }
        }
      }
      return attrsToObserve;
    },

    toOptionValue: toOptionValue,
    camelCase: camelCase,
    setDelayedGeoLocation: setDelayedGeoLocation,
    observeAndSet: observeAndSet

  }; // return
}; // function
ngMap.services.Attr2Options.$inject = ['$parse', 'NavigatorGeolocation', 'GeoCoder']; 

/**
 * @ngdoc service
 * @name GeoCoder
 * @description
 *   Provides [defered/promise API](https://docs.angularjs.org/api/ng/service/$q) service for Google Geocoder service
 */
ngMap.services.GeoCoder = function($q) {
  return {
    /**
     * @memberof GeoCoder
     * @param {Hash} options https://developers.google.com/maps/documentation/geocoding/#geocoding
     * @example
     * ```
     *   GeoCoder.geocode({address: 'the cn tower'}).then(function(result) {
     *     //... do something with result
     *   });
     * ```
     * @returns {HttpPromise} Future object
     */
    geocode : function(options) {
      var deferred = $q.defer();
      var geocoder = new google.maps.Geocoder();
      geocoder.geocode(options, function (results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
          deferred.resolve(results);
        } else {
          deferred.reject('Geocoder failed due to: '+ status);
        }
      });
      return deferred.promise;
    }
  }
};
ngMap.services.GeoCoder.$inject = ['$q'];


/**
 * @ngdoc service
 * @name NavigatorGeolocation
 * @description
 *  Provides [defered/promise API](https://docs.angularjs.org/api/ng/service/$q) service for navigator.geolocation methods
 */
ngMap.services.NavigatorGeolocation =  function($q) {
  return {
    /**
     * @memberof NavigatorGeolocation
     * @param {function} success success callback function
     * @param {function} failure failure callback function
     * @example
     * ```
     *  NavigatorGeolocation.getCurrentPosition()
     *    .then(function(position) {
     *      var lat = position.coords.latitude, lng = position.coords.longitude;
     *      .. do something lat and lng
     *    });
     * ```
     * @returns {HttpPromise} Future object
     */
    getCurrentPosition: function() {
      var deferred = $q.defer();
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          function(position) {
            deferred.resolve(position);
          }, function(evt) {
            console.error(evt);
            deferred.reject(evt);
          }
        );
      } else {
        deferred.reject("Browser Geolocation service failed.");
      }
      return deferred.promise;
    },

    watchPosition: function() {
      return "TODO";
    },

    clearWatch: function() {
      return "TODO";
    }
  };
} // func
ngMap.services.NavigatorGeolocation.$inject = ['$q'];


/**
 * @ngdoc service
 * @name StreetView
 * @description
 *  Provides [defered/promise API](https://docs.angularjs.org/api/ng/service/$q) service 
 *  for [Google StreetViewService](https://developers.google.com/maps/documentation/javascript/streetview)
 */
ngMap.services.StreetView = function($q) {
  return {
    /**
     * Retrieves panorama id from the given map (and or position)
     * @memberof StreetView
     * @param {map} map Google map instance
     * @param {LatLng} latlng Google LatLng instance  
     *   default: the center of the map
     * @example
     *   StreetView.getPanorama(map).then(function(panoId) {
     *     $scope.panoId = panoId;
     *   });
     * @returns {HttpPromise} Future object
     */
    getPanorama : function(map, latlng) {
      latlng = latlng || map.getCenter();
      var deferred = $q.defer();
      var svs = new google.maps.StreetViewService();
      svs.getPanoramaByLocation( (latlng||map.getCenter), 100, function (data, status) {
        // if streetView available
        if (status === google.maps.StreetViewStatus.OK) {
          deferred.resolve(data.location.pano);
        } else {
          // no street view available in this range, or some error occurred
          deferred.resolve(false);
          //deferred.reject('Geocoder failed due to: '+ status);
        }
      });
      return deferred.promise;
    },
    /**
     * Set panorama view on the given map with the panorama id
     * @memberof StreetView
     * @param {map} map Google map instance
     * @param {String} panoId Panorama id fro getPanorama method
     * @example
     *   StreetView.setPanorama(map, panoId);
     */
    setPanorama : function(map, panoId) {
      var svp = new google.maps.StreetViewPanorama(map.getDiv(), {enableCloseButton: true});
      svp.setPano(panoId);
    }
  }; // return
} // func
ngMap.services.StreetView.$inject =  ['$q'];

/**
 * @ngdoc directive
 * @name map
 * @requires Attr2Options
 * @description
 *   Implementation of {@link MapController}
 *   Initialize a Google map within a `<div>` tag with given options and register events
 *   It accepts children directives; marker, shape, or marker-clusterer
 *
 *   It initialize map, children tags, then emits message as soon as the action is done
 *   The message emitted from this directive is;
 *     . mapInitialized
 *
 *   Restrict To:
 *     Element Or Attribute
 *
 * @param {Array} geo-fallback-center 
 *    The center of map incase geo location failed. 
 *    This should not be used with `center`, since `center` overrides `geo-fallback-center`
 * @param {String} &lt;MapOption> Any Google map options, https://developers.google.com/maps/documentation/javascript/reference?csw=1#MapOptions
 * @param {String} &lt;MapEvent> Any Google map events, https://rawgit.com/allenhwkim/angularjs-google-maps/master/build/map_events.html
 * @example
 * Usage:
 *   <map MAP_OPTIONS_OR_MAP_EVENTS ..>
 *     ... Any children directives
 *   </map>
 *   Or,
 *   <ANY map MAP_OPTIONS_OR_MAP_EVENTS ..>
 *     ... Any children directives
 *   </ANY>
 *
 * Example:
 *   <map center="[40.74, -74.18]" on-click="doThat()">
 *   </map>
 *
 *   <div map center="[40.74, -74.18]" on-click="doThat()">
 *   </div>
 *
 *   <map geo-fallback-center="[40.74, -74.18]">
 *   </div>
 */
ngMap.directives.map = function(Attr2Options, $timeout) {
  var parser = Attr2Options;
  function getStyle(el,styleProp)
  {
    if (el.currentStyle) {
      var y = el.currentStyle[styleProp];
    } else if (window.getComputedStyle) {
      var y = document.defaultView.getComputedStyle(el,null).getPropertyValue(styleProp);
    }
    return y;
  }

  return {
    restrict: 'AE',
    controller: ngMap.directives.MapController,
    /**
     * Initialize map and events
     * @memberof map
     * @param {$scope} scope
     * @param {angular.element} element
     * @param {Hash} attrs
     * @ctrl {MapController} ctrl
     */
    link: function (scope, element, attrs, ctrl) {
      /*
       * without this, bird_eyes_and_street_view.html and map_options does not work.
       * I don't know why
       */
      scope.google = google; 

      /**
       * create a new `div` inside map tag, so that it does not touch map element
       * http://stackoverflow.com/questions/20955356
       */
      var el = document.createElement("div");
      el.style.width = "100%";
      el.style.height = "100%";
      element.prepend(el);

      /**
       * if style is not given to the map element, set display and height
       */
      if (getStyle(element[0], 'display') != "block") {
        element.css('display','block');
      }
      if (!getStyle(element[0], 'height').match(/px/)) {
        element.css('height','300px');
      }

      /**
       * get map optoins
       */
      var filtered = parser.filter(attrs);
      console.log('filtered', filtered);
      var options = parser.getOptions(filtered, scope);
      var controlOptions = parser.getControlOptions(filtered);
      var mapOptions = angular.extend(options, controlOptions);
      mapOptions.zoom = mapOptions.zoom || 15;
      console.log("mapOptions", mapOptions, "mapEvents", mapEvents);

      /**
       * get original attributes, so that we can use it for observers
       */
      var orgAttributes = {};
      for (var i=0; i<element[0].attributes.length; i++) {
        var attr = element[0].attributes[i];
        orgAttributes[attr.name] = attr.value;
      }
      console.log('orgAttributes', orgAttributes);

      var map = new google.maps.Map(el, {});
      map.markers = {};
      map.shapes = {};
     
      /**
       * resize the map to prevent showing partially, in case intialized too early
       */
      $timeout(function() {
        google.maps.event.trigger(map, "resize");
      });

      /**
       * set options
       */
      var center = mapOptions.center;
      if (!(center instanceof google.maps.LatLng)) {
        delete options.center;
        Attr2Options.setDelayedGeoLocation(
          map, 
          'setCenter', 
          center, 
          options.geoFallbackCenter
        );
      }
      map.setOptions(options);

      /**
       * set events
       */
      var mapEvents = parser.getEvents(scope, filtered);
      for (var eventName in mapEvents) {
        if (eventName) {
          google.maps.event.addListener(map, eventName, mapEvents[eventName]);
        }
      }

      /**
       * set observers
       */
      var attrsToObserve = parser.getAttrsToObserve(orgAttributes);
      console.log('map attrs to observe', attrsToObserve);
      for (var i=0; i<attrsToObserve.length; i++) {
        parser.observeAndSet(attrs, attrsToObserve[i], map);
      }

      /**
       * set controller and set objects
       * so that map can be used by other directives; marker or shape 
       * ctrl._objects are gathered when marker and shape are initialized before map is set
       */
      ctrl.map = map;   /* so that map can be used by other directives; marker or shape */
      ctrl.addObjects(ctrl._objects);

      /**
       * set map for scope and controller and broadcast map event
       * scope.map will be overwritten if user have multiple maps in a scope,
       * thus the last map will be set as scope.map.
       * however an `mapInitialized` event will be emitted every time.
       */
      scope.map = map;
      scope.map.scope = scope;
      scope.$emit('mapInitialized', scope.map);  

      // the following lines will be deprecated on behalf of mapInitialized
      // to collect maps, we should use scope.maps in your own controller, i.e. MyCtrl
      scope.maps = scope.maps || {}; 
      scope.maps[options.id||Object.keys(scope.maps).length] = map;
      scope.$emit('mapsInitialized', scope.maps);  
    }
  }; 
}; // function
ngMap.directives.map.$inject = ['Attr2Options', '$timeout'];

/**
 * @ngdoc directive
 * @name MapController
 * @requires $scope
 * @property {Hash} controls collection of Controls initiated within `map` directive
 * @property {Hash} markersi collection of Markers initiated within `map` directive
 * @property {Hash} shapes collection of shapes initiated within `map` directive
 * @property {MarkerClusterer} markerClusterer MarkerClusterer initiated within `map` directive
 */
ngMap.directives.MapController = function($scope) { 

  this.map = null;
  this._objects = [];

  /**
   * Add a marker to map and $scope.markers
   * @memberof MapController
   * @name addMarker
   * @param {Marker} marker google map marker
   */
  this.addMarker = function(marker) {
    /**
     * marker and shape are initialized before map is initialized
     * so, collect _objects then will init. those when map is initialized
     * However the case as in ng-repeat, we can directly add to map
     */
    if (this.map) {
      this.map.markers = this.map.markers || {};
      marker.setMap(this.map);
      if (marker.centered) {
        this.map.setCenter(marker.position);
      }
      var len = Object.keys(this.map.markers).length;
      this.map.markers[marker.id || len] = marker;
    } else {
      this._objects.push(marker);
    }
  };

  /**
   * Add a shape to map and $scope.shapes
   * @memberof MapController
   * @name addShape
   * @param {Shape} shape google map shape
   */
  this.addShape = function(shape) {
    if (this.map) {
      this.map.shapes = this.map.shapes || {};
      shape.setMap(this.map);
      var len = Object.keys(this.map.shapes).length;
      this.map.shapes[shape.id || len] = shape;
    } else {
      this._objects.push(shape);
    }
  };

  /**
   * Add a shape to map and $scope.shapes
   * @memberof MapController
   * @name addShape
   * @param {Shape} shape google map shape
   */
  this.addObjects = function(objects) {
    for (var i=0; i<objects.length; i++) {
      var obj=objects[i];
      if (obj instanceof google.maps.Marker) {
        this.addMarker(obj);
      } else if (obj instanceof google.maps.Circle ||
        obj instanceof google.maps.Polygon ||
        obj instanceof google.maps.Polyline ||
        obj instanceof google.maps.Rectangle ||
        obj instanceof google.maps.GroundOverlay) {
        this.addShape(obj);
      }
    }
  };

};
ngMap.directives.MapController.$inject = ['$scope'];

/**
 * @ngdoc directive
 * @name marker
 * @requires Attr2Options 
 * @requires NavigatorGeolocation
 * @description 
 *   Draw a Google map marker on a map with given options and register events  
 *   
 *   Requires:  map directive
 *
 *   Restrict To:  Element Or Attribute
 *
 * @param {String} position address, 'current', or [latitude, longitude]  
 *    example:  
 *      '1600 Pennsylvania Ave, 20500  Washingtion DC',   
 *      'current position',  
 *      '[40.74, -74.18]'  
 * @param {Boolean} centered if set, map will be centered with this marker
 * @param {String} &lt;MarkerOption> Any Marker options, https://developers.google.com/maps/documentation/javascript/reference?csw=1#MarkerOptions  
 * @param {String} &lt;MapEvent> Any Marker events, https://developers.google.com/maps/documentation/javascript/reference
 * @example
 * Usage: 
 *   <map MAP_ATTRIBUTES>
 *    <marker ANY_MARKER_OPTIONS ANY_MARKER_EVENTS"></MARKER>
 *   </map>
 *
 * Example: 
 *   <map center="[40.74, -74.18]">
 *    <marker position="[40.74, -74.18]" on-click="myfunc()"></div>
 *   </map>
 *
 *   <map center="the cn tower">
 *    <marker position="the cn tower" on-click="myfunc()"></div>
 *   </map>
 */
ngMap.directives.marker  = function(Attr2Options)  {
  var parser = Attr2Options;

  var getMarker = function(options, events) {
    var marker;

    /**
     * set options
     */
    if (!(options.position instanceof google.maps.LatLng)) {
      var orgPosition = options.position;
      options.position = new google.maps.LatLng(0,0);
      marker = new google.maps.Marker(options);
      parser.setDelayedGeoLocation(marker, 'setPosition', orgPosition);
    } else {
      marker = new google.maps.Marker(options);
    }

    /**
     * set events
     */
    if (Object.keys(events).length > 0) {
      console.log("markerEvents", events);
    }
    for (var eventName in events) {
      if (eventName) {
        google.maps.event.addListener(marker, eventName, events[eventName]);
      }
    }

    return marker;
  };

  return {
    restrict: 'AE',
    require: '^map',
    link: function(scope, element, attrs, mapController) {
      //var filtered = new parser.filter(attrs);
      var filtered = parser.filter(attrs);
      var markerOptions = parser.getOptions(filtered, scope);
      var markerEvents = parser.getEvents(scope, filtered);

      /**
       * set event to clean up removed marker
       * useful with ng-repeat
       */
      if (markerOptions.ngRepeat) {
        element.bind('$destroy', function() {
          var markers = marker.map.markers;
          for (var name in markers) {
            if (markers[name] == marker) {
              delete markers[name];
            }
          }
          marker.setMap(null);          
        });
      }

      var orgAttributes = {};
      for (var i=0; i<element[0].attributes.length; i++) {
        var attr = element[0].attributes[i];
        orgAttributes[attr.name] = attr.value;
      }

      var marker = getMarker(markerOptions, markerEvents);
      mapController.addMarker(marker);

      /**
       * set observers
       */
      var attrsToObserve = parser.getAttrsToObserve(orgAttributes);
      console.log('marker attrs to observe', attrsToObserve);
      for (var i=0; i<attrsToObserve.length; i++) {
        parser.observeAndSet(attrs, attrsToObserve[i], marker);
      }

    } //link
  }; // return
};// function
ngMap.directives.marker.$inject  = ['Attr2Options'];

/**
 * @ngdoc directive
 * @name shape
 * @requires Attr2Options 
 * @description 
 *   Initialize a Google map shape in map with given options and register events  
 *   The shapes are:
 *     . circle
 *     . polygon
 *     . polyline
 *     . rectangle
 *     . groundOverlay(or image)
 *   
 *   Requires:  map directive
 *
 *   Restrict To:  Element Or Attribute
 *
 * @param {Boolean} centered if set, map will be centered with this marker
 * @param {String} &lt;OPTIONS>
 *   For circle, [any circle options](https://developers.google.com/maps/documentation/javascript/reference#CircleOptions)  
 *   For polygon, [any polygon options](https://developers.google.com/maps/documentation/javascript/reference#PolygonOptions)  
 *   For polyline, [any polyline options](https://developers.google.com/maps/documentation/javascript/reference#PolylineOptions)   
 *   For rectangle, [any rectangle options](https://developers.google.com/maps/documentation/javascript/reference#RectangleOptions)   
 *   For image, [any groundOverlay options](https://developers.google.com/maps/documentation/javascript/reference#GroundOverlayOptions)   
 * @param {String} &lt;MapEvent> Any Shape events, https://developers.google.com/maps/documentation/javascript/reference
 * @example
 * Usage: 
 *   <map MAP_ATTRIBUTES>
 *    <shape name=SHAPE_NAME ANY_SHAPE_OPTIONS ANY_SHAPE_EVENTS"></MARKER>
 *   </map>
 *
 * Example: 
 *
 *   <map zoom="11" center="[40.74, -74.18]">
 *     <shape id="polyline" name="polyline" geodesic="true" stroke-color="#FF0000" stroke-opacity="1.0" stroke-weight="2"
 *      path="[[40.74,-74.18],[40.64,-74.10],[40.54,-74.05],[40.44,-74]]" ></shape>
 *    </map>
 *
 *   <map zoom="11" center="[40.74, -74.18]">
 *     <shape id="polygon" name="polygon" stroke-color="#FF0000" stroke-opacity="1.0" stroke-weight="2"
 *      paths="[[40.74,-74.18],[40.64,-74.18],[40.84,-74.08],[40.74,-74.18]]" ></shape>
 *   </map>
 *   
 *   <map zoom="11" center="[40.74, -74.18]">
 *     <shape id="rectangle" name="rectangle" stroke-color='#FF0000' stroke-opacity="0.8" stroke-weight="2"
 *      bounds="[[40.74,-74.18], [40.78,-74.14]]" editable="true" ></shape>
 *   </map>
 *
 *   <map zoom="11" center="[40.74, -74.18]">
 *     <shape id="circle" name="circle" stroke-color='#FF0000' stroke-opacity="0.8"stroke-weight="2" 
 *      center="[40.70,-74.14]" radius="4000" editable="true" ></shape>
 *   </map>
 *
 *   <map zoom="11" center="[40.74, -74.18]">
 *     <shape id="image" name="image" url="https://www.lib.utexas.edu/maps/historical/newark_nj_1922.jpg"
 *      bounds="[[40.71,-74.22],[40.77,-74.12]]" opacity="0.7" clickable="true" ></shape>
 *   </map>
 *
 *  For full-working example, please visit 
 *    [shape example](https://rawgit.com/allenhwkim/angularjs-google-maps/master/build/shape.html)
 */
ngMap.directives.shape = function(Attr2Options) {
  var parser = Attr2Options;
  
  var getBounds = function(points) {
    return new google.maps.LatLngBounds(points[0], points[1]);
  };
  
  var getShape = function(options, events) {
    var shape;

    var shapeName = options.name;
    delete options.name;  //remove name bcoz it's not for options

    /**
     * set options
     */
    console.log("shape", shapeName, "options", options);
    switch(shapeName) {
      case "circle":
        if (options.center instanceof google.maps.LatLng) {
          shape = new google.maps.Circle(options);
        } else {
          var orgCenter = options.center;
          options.center = new google.maps.LatLng(0,0);
          shape = new google.maps.Circle(options);
          parser.setDelayedGeoLocation(shape, 'setCenter', orgCenter);
        }
        break;
      case "polygon":
        shape = new google.maps.Polygon(options);
        break;
      case "polyline": 
        shape = new google.maps.Polyline(options);
        break;
      case "rectangle": 
        options.bounds = getBounds(options.bounds);
        shape = new google.maps.Rectangle(options);
        break;
      case "groundOverlay":
      case "image":
        var url = options.url;
        var bounds = getBounds(options.bounds);
        var opts = {opacity: options.opacity, clickable: options.clickable, id:options.id};
        shape = new google.maps.GroundOverlay(url, bounds, opts);
        break;
    }

    /**
     * set events
     */
    console.log("shape", shapeName, "events", events);
    for (var eventName in events) {
      if (events[eventName]) {
        console.log(eventName, events[eventName]);
        google.maps.event.addListener(shape, eventName, events[eventName]);
      }
    }
    return shape;
  };
  
  return {
    restrict: 'AE',
    require: '^map',
    /**
     * link function
     * @private
     */
    link: function(scope, element, attrs, mapController) {
      var filtered = parser.filter(attrs);
      var shapeOptions = parser.getOptions(filtered);
      var shapeEvents = parser.getEvents(scope, filtered);

      var shape = getShape(shapeOptions, shapeEvents);
      mapController.addShape(shape);

      var orgAttributes = {};
      for (var i=0; i<element[0].attributes.length; i++) {
        var attr = element[0].attributes[i];
        orgAttributes[attr.name] = attr.value;
      }

      /**
       * set observers
       */
      var attrsToObserve = parser.getAttrsToObserve(orgAttributes);
      console.log('shape attrs to observe', attrsToObserve);
      for (var i=0; i<attrsToObserve.length; i++) {
        parser.observeAndSet(attrs, attrsToObserve[i], shape);
      }
    }
   }; // return
}; // function
ngMap.directives.shape.$inject  = ['Attr2Options'];

var ngMapModule = angular.module('ngMap', []);

for (var key in ngMap.services) {
  ngMapModule.service(key, ngMap.services[key]);
}

for (var key in ngMap.directives) {
  if(key != "MapController") {   // MapController is a controller for directives
    ngMapModule.directive(key, ngMap.directives[key]);
  }
}
