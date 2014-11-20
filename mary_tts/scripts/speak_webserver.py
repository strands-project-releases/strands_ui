#!/usr/bin/env python

from flask import Flask
from flask import render_template
from flask import request, redirect, jsonify
import roslib
import rospy
import actionlib
import mary_tts.msg
import mongodb_store.srv

roslib.load_manifest('mary_tts')

pkg_dir = roslib.packages.get_pkg_dir('mary_tts')
app = Flask(__name__,static_folder=pkg_dir+'/static', template_folder=pkg_dir+'/templates')


node_name = 'speak_webserver'
param_prefix = '/' + node_name + '/speak_lines/'


def get_param_key(n):
    return param_prefix + get_id_str(n)


def get_id_str(n):
    return 'id' + str(n + 1)


def generate_lines(n):
    lines = []
    for i in range(n):
        idv = get_id_str(i)
        idp = get_param_key(i)
        rospy.logdebug('read rosparam for ' + idp)
        if rospy.has_param(idp):
            sl = rospy.get_param(idp)
        else:
            sl = 'Test ' + str(i + 1)
        lines.append({'id': idv, 'value': sl})
    return lines


def save_line(id_value, text_value):
    rospy.loginfo('store ros param for ' + id_value + ' as ' + text_value)
    rospy.set_param(param_prefix + id_value, text_value)
    try:
        save_service = rospy.ServiceProxy(
            '/config_manager/save_param', mongodb_store.srv.SetParam)
        if not save_service.call(param_prefix + id_value):
            rospy.logwarn('couldn\'t store config in mongodb_store')
    except:
        rospy.logwarn('couldn\'t access the mongodb_store service')


@app.route("/")
def main_page():
    l = generate_lines(15)
    return render_template('index.html', lines=l)


@app.route('/speak')
def speak():
    text_value = request.args.get('text_value')
    id_value = request.args.get('id_value')
    # the code below is executed if the request method
    # was GET or the credentials were invalid
    save_line(id_value, text_value)
    rospy.loginfo('trying to say "' + text_value + '"')
    rospy.loginfo('waiting for say server')
    client = actionlib.SimpleActionClient(
        '/visual_speech', mary_tts.msg.maryttsAction)

    client.wait_for_server()
    g = mary_tts.msg.maryttsGoal()
    g.text = text_value
    rospy.loginfo('start speaking')
    client.send_goal(g)
    rospy.loginfo('started speaking')
    client.wait_for_result()
    rospy.loginfo('finished speaking')
    return jsonify({'result': True})


if __name__ == "__main__":
    rospy.init_node(node_name)
    app.run(host='0.0.0.0', port=8888, use_reloader=False, debug=True)
