@echo off
cd /d C:\Users\ae4g24\skool-agent

set SKOOL_EMAIL=Ahirad99@gmail.com
set SKOOL_PASSWORD=Antifragile15!
set GEMINI_API_KEY=AIzaSyATgqmM-I76enuyerw76GNO10QeeQfkDu4

node src/index.js >> logs.txt 2>&1
