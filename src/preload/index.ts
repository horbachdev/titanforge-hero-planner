import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('shopTitansApp', {
  platform: process.platform
});
