import * as Matrix from 'matrix-js-sdk'

function getRoomWithState (roomId) {
  const checkForState = resolve => _ => {
    const room = this.getRoom(roomId)
    if (room) resolve(room)
    else setTimeout(checkForState(resolve), 500)
  }
  return new Promise(resolve => checkForState(resolve)())
}

function getHttpUriForMxcFromHS (mxc, width, height, resizeMethod, allowDirectLinks) {
  return Matrix.getHttpUriForMxc(this.getHomeserverUrl(), mxc, width, height, resizeMethod, allowDirectLinks, true, true)
}

export default class Client {
  static client

  static isResumable () {
    return !!localStorage.getItem('accessToken') &&
           !!localStorage.getItem('userId') &&
           !!localStorage.getItem('baseUrl')
  }

  static async initClient () {
    let indexedDB
    try { indexedDB = window.indexedDB } catch {}
    const clientOpts = {
      baseUrl: localStorage.getItem('baseUrl'),
      userId: localStorage.getItem('userId'),
      accessToken: localStorage.getItem('accessToken'),
      deviceId: localStorage.getItem('deviceId'),
      timelineSupport: true
    }
    if (indexedDB) {
      console.log('using indexedDB')
      clientOpts.store = new Matrix.IndexedDBStore({
        indexedDB,
        localStorage,
        dbName: 'populus-web-sync',
        workerScript: './indexeddb-worker.js'
      })
      Client.client = Matrix.createClient(clientOpts)
      await clientOpts.store.startup()
    } else {
      Client.client = Matrix.createClient(clientOpts)
    }
    Client.client.getRoomWithState = getRoomWithState.bind(Client.client)
    Client.client.getHttpUriForMxcFromHS = getHttpUriForMxcFromHS.bind(Client.client)
    const notifTimelineSet = new Matrix.EventTimelineSet(null, { timelineSupport: true })
    notifTimelineSet.getLiveTimeline().setPaginationToken('', Matrix.EventTimeline.BACKWARDS)
    // XXX: following
    // https://github.com/matrix-org/matrix-react-sdk/blob/2d1d42b90e8418017348cae1bd17a8a92340fdfb/src/MatrixClientPeg.ts#L296
    // for original pagination token though this might not be correct.
    Client.client.setNotifTimelineSet(notifTimelineSet)
    return Client.client
  }

  static restart () {
    Client.client.stopClient()
    Client.client.logout()
    Client.client.store.deleteAllData()
    Client.initClient()
  }
}
