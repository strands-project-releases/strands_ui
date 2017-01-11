  var hostname = location.hostname;
  console.log(hostname);
  var ros = new ROSLIB.Ros({
    url : rosws_url
  });
  
  ros.on('connection', function() {
    console.log('Connected to websocket server.');
    $("#connection_broken").addClass('hide');
    $("#connection_ok").removeClass('hide');
  });

  ros.on('error', function(error) {
    console.log('Error connecting to websocket server: ', error);
    $("#connection_ok").addClass('hide');
    $("#connection_broken").removeClass('hide');
  });

  ros.on('close', function() {
    console.log('Connection to websocket server closed.');
    $("#connection_ok").addClass('hide');
    $("#connection_broken").removeClass('hide');
  });

  function emergency_stop() {
    console.log("notfall");
    var service = new ROSLIB.Service({ros : ros, name : '/go_to_safety_point', serviceType : 'std_srvs/Empty'}); 
    var request = new ROSLIB.ServiceRequest();  
    service.callService(request, function(result) {
      console.log('Called emergency service');
    });
    var service = new ROSLIB.Service({ros : ros, name : '/deployment_control/pause', serviceType : 'std_srvs/Empty'});
    var request = new ROSLIB.ServiceRequest();
    service.callService(request, function(result) {
      console.log('Called pause service');
    });
  }

  function init_say() {
    var sayTopic = new ROSLIB.Topic({
        ros         : ros,
        name        : '/speak/goal',
        messageType : 'mary_tts/maryttsActionGoal'
    });
    
    sayTopic.subscribe(function(message) {
        // Formats the pose for outputting.
        var say = message.goal.text;

        document.getElementById("saytext").innerHTML=say;
    });

  }

  function init_tasks() {
    var taskTopic = new ROSLIB.Topic({
        ros         : ros,
        name        : '/current_schedule',
        messageType : 'strands_executive_msgs/ExecutionStatus'
    });
    
    taskTopic.subscribe(function(message) {
        // Formats the pose for outputting.
        var text = "not currently in any task"

        if (message.currently_executing) {
          text = message.execution_queue[0].action + " an " + message.execution_queue[0].start_node_id;
        }
        document.getElementById("tasktext").innerHTML = text;

        html = ""
        for (var t=0; t < message.execution_queue.length; t++) {
            var task = message.execution_queue[t];
            var date = new Date(task.execution_time.secs*1000).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' });
            html += "<tr data-toggle=\"modal\" data-target=\"#deletetask\" data-whatever=\" * task.task_id + \">";
            html += "<td>" + task.task_id + "</td>";
            html += "<td>" + task.action + "</td>";
            html += "<td>" + task.start_node_id + "</td>";
            html += "<td>" + date + "</td>";
            html += "</tr>";
           
        }
        document.getElementById("tasklist").innerHTML = html;



    });

  }




  function init_node() {
    var nodeTopic = new ROSLIB.Topic({
        ros         : ros,
        name        : '/current_node',
        messageType : 'std_msgs/String'
    });
    
    nodeTopic.subscribe(function(message) {
        // Formats the pose for outputting.
        document.getElementById("currentnodetext").innerHTML = message.data;
    });

  }



  function init_battery() {
    var batteryListener = new ROSLIB.Topic({
      ros : ros,
      name : '/battery_state',
      messageType : 'scitos_msgs/BatteryState',
      throttle_rate : 1
    });    
    
    batteryListener.subscribe(function(message) {
        // Formats the pose for outputting.
        var battery = message.lifePercent;
        document.getElementById("batterytext").innerHTML = battery + "%";
        //document.getElementById("batterytext").update(battery + "%");
    });

  }

  function init_rosout() {
    var rosoutListener = new ROSLIB.Topic({
      ros : ros,
      name : '/rosout',
      messageType : 'rosgraph_msgs/Log',
    });    
    
    rosoutListener.subscribe(function(message) {
        // Formats the pose for outputting.

        var rosout = message.lifePercent;
        if (message.level > 4) {
          document.getElementById("rosouttext").innerHTML = "[" + message.header.stamp.secs + "] " + message.msg;
        }
        //document.getElementById("batterytext").update(battery + "%");
    });

  }

  function init_mjpeg(hostname) {
    // Create the main viewer.
    var viewer = new MJPEGCANVAS.Viewer({
    divID : 'mjpeg',
    host : hostname,
    port: mjpeg_suffix,
    width : 320,
    height : 240,
    topic : '/head_xtion/rgb/image_color'
    });
 
  }

  function init_map(hostname) {
    // Create the main viewer.
    var viewer = new ROS2D.Viewer({
      divID : 'nav',
      width : 800,
      height : 250
    });
    var initScaleSet = false;

    // Subscribes to the robot's OccupancyGrid, which is ROS representation of
    // the map, and renders the map in the scene.
    var gridClient = new ROS2D.OccupancyGridClient({
      ros : ros,
      rootObject : viewer.scene
    });
    gridClient.on('change', function() {
      // scale the viewer to fit the map
      var aspect_ratio = gridClient.currentGrid.width / gridClient.currentGrid.height;
      var scale_x = gridClient.currentGrid.width / viewer.width;
      var scale_y = gridClient.currentGrid.height / viewer.height;
      var scale = (scale_x > scale_y) ? scale_x : scale_y;

      initScaleSet = false;

      viewer.scaleToDimensions(scale * viewer.width, 
        scale * viewer.height);
      viewer.shift(gridClient.currentGrid.x, -gridClient.currentGrid.height-gridClient.currentGrid.y);
    });

    // get a handle to the stage
    var stage;
    if (viewer.scene instanceof createjs.Stage) {
      stage = viewer.scene;
    } else {
      stage = viewer.scene.getStage();
    }
    // marker for the robot
    var robotMarker = new ROS2D.NavigationArrow({
      size : 8,
      strokeSize : 1,
      fillColor : createjs.Graphics.getRGB(255, 128, 0, 0.66),
      pulse : false
    });
    // wait for a pose to come in first
    robotMarker.visible = false;
   
    viewer.scene.addChild(robotMarker);
    // setup a listener for the robot pose
    var poseListener = new ROSLIB.Topic({
      ros : ros,
      name : '/robot_pose',
      messageType : 'geometry_msgs/Pose',
      throttle_rate : 10
    });
    poseListener.subscribe(function(pose) {
      // update the robots position on the map
      robotMarker.x = pose.position.x;
      robotMarker.y = -pose.position.y;
      
      if (!initScaleSet) {
        robotMarker.scaleX = 1.0 / stage.scaleX;
        robotMarker.scaleY = 1.0 / stage.scaleY;
        initScaleSet = true;
      }
      // change the angle
      robotMarker.rotation = stage.rosQuaternionToGlobalTheta(pose.orientation);
      robotMarker.visible = true;
    });
  }



  function init() {
    init_say();
    init_battery();
    init_tasks();
    init_node();
    init_rosout();
    init_map();
  }
