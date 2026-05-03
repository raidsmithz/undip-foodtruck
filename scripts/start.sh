#!/bin/bash
cd /home/ubuntu/undip-foodtruck
exec /usr/bin/xvfb-run -a --server-args='-screen 0 1280x1024x24' /usr/bin/npm start
