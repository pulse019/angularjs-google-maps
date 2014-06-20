/**
 * @ngdoc directive
 * @param Attr2Options
 * @param $parse
 * @param NavigatorGeolocation
 * @param GeoCoder
 * @param $compile
 * @returns 
 *   restrict: AE<br>
 *   controller: map controller that is used by children directives<br>
 *   link: initiliaze map<br>
 */
ngMap.directives.map = function(Attr2Options, $parse, NavigatorGeolocation, GeoCoder, $compile) {
  //var parser = new Attr2Options();
  var parser = Attr2Options;

  return {
    restrict: 'AE',
    controller: ['$scope', function($scope) { //parent controller scope
      this.map = null;
      this.controls = {};
      this.markers = [];
      this.shapes = [];
      this.infoWindows = [];
      this.markerCluster = null;

      /**
       * Initialize map and events
       * @param scope
       * @param element
       * @param attrs
       * @return map object
       */ 
      this.initMap = function(scope, element, attrs) {
        var filtered = parser.filter(attrs);
        scope.google = google;
        var mapOptions = parser.getOptions(filtered, scope);
        var controlOptions = parser.getControlOptions(filtered);
        for(var key in controlOptions) {
          if (key) {
            mapOptions[key] = controlOptions[key];
          }
        }

        var _this = this;
        var savedCenter = null;

        if (!mapOptions.zoom) {
          mapOptions.zoom = 15; //default zoom
        }
        if (mapOptions.center instanceof Array) {
          var lat = mapOptions.center[0], lng= mapOptions.center[1];
          mapOptions.center = new google.maps.LatLng(lat,lng);
        } else {
          savedCenter = mapOptions.center;
          delete mapOptions.center; //cannot show map with center as string
        }
        
        for (var name in this.controls) {
          if (name) {
            mapOptions[name+"Control"] = this.controls[name].enabled === "false" ? 0:1;
            delete this.controls[name].enabled;
            mapOptions[name+"ControlOptions"] = this.controls[name];
          }
        }
        
        console.log("mapOptions", mapOptions);
        // create a new div for map portion, so it does not touch map element at all.
        // http://stackoverflow.com/questions/20955356
        var el = document.createElement("div");
        el.style.width = "100%";
        el.style.height = "100%";
        element.prepend(el);
        _this.map = new google.maps.Map(el, mapOptions);

        if (typeof savedCenter == 'string') { //address
          GeoCoder.geocode({address: savedCenter})
            .then(function(results) {
              _this.map.setCenter(results[0].geometry.location);
            });
        } else if (!mapOptions.center) { //current location
          NavigatorGeolocation.getCurrentPosition()
            .then(function(position) {
              var lat = position.coords.latitude, lng = position.coords.longitude;
              _this.map.setCenter(new google.maps.LatLng(lat, lng));
            })
        }

        //map events
        var events = parser.getEvents(scope, filtered);
        console.log("mapEvents", events);
        for (var eventName in events) {
          if (eventName) {
            google.maps.event.addListener(_this.map, eventName, events[eventName]);
          }
        }

        //assign map to parent scope  
        scope.map = _this.map;
        return _this.map;
      },

      /**
       * Initial markers for this map
       * 
       * This does not work with async. actions. i.e, geocoder
       * because markers are not added at this moment
       * Thus, markers will be watched and updated with scope.$watch
       * @param marker
       */
      this.addMarker = function(marker) {
        marker.setMap(this.map);
        if (marker.centered) {
          this.map.setCenter(marker.position);
        }
        var len = Object.keys($scope.markers).length;
        $scope.markers[marker.id || len] = marker;
      };

      /**
       * Initialize markers
       * @returns markers
       */
      this.initMarkers = function() {
        $scope.markers = {};
        for (var i=0; i<this.markers.length; i++) {
          var marker = this.markers[i];
          this.addMarker(marker);
        }
        return $scope.markers;
      };

      /**
       * Initialize shapes for this map
       * @returns shapes
       */
      this.initShapes = function() {
        $scope.shapes = {};
        for (var i=0; i<this.shapes.length; i++) {
          var shape = this.shapes[i];
          shape.setMap(this.map);
          $scope.shapes[shape.id || (i+1) ] = shape; // can have id as key
        }
        return $scope.shapes;
      };

      /**
       * Initialize infoWindows for this map
       * @returns infoWindows
       */
      this.initInfoWindows = function() {
        $scope.infoWindows = {};
        for (var i=0; i<this.infoWindows.length; i++) {
          var obj = this.infoWindows[i];
          $scope.infoWindows[obj.id || (i+1) ] = obj; 
        }
        return $scope.infoWindows;
      };

      /**
       * Initialize markerClusterere for this map
       * @returns markerClusterer
       */
      this.initMarkerClusterer = function() {
        if (this.markerClusterer) {
          $scope.markerClusterer = new MarkerClusterer(
            this.map, 
            this.markerClusterer.data, 
            this.markerClusterer.pptions
          );
        }
        return $scope.markerClusterer;
      };
    }],
    link: function (scope, element, attrs, ctrl) {
      var map = ctrl.initMap(scope, element, attrs);
      scope.$emit('mapInitialized', map);  
      var markers = ctrl.initMarkers();
      scope.$emit('markersInitialized', markers);  
      var shapes = ctrl.initShapes();
      scope.$emit('shapesInitialized', shapes);  
      var infoWindows = ctrl.initInfoWindows();
      scope.$emit('infoWindowsInitialized', infoWindows);  
      var markerClusterer= ctrl.initMarkerClusterer();
      scope.$emit('markerClustererInitialized', markerClusterer);  
    }
  }; // return
}; // function
ngMap.directives.map.$inject = ['Attr2Options', '$parse', 'NavigatorGeolocation', 'GeoCoder', '$compile'];
