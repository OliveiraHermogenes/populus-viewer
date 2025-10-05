import History from './history.js'
import Client from './client.js'
import { UserColor } from './utils/colors.js'
import * as Matrix from 'matrix-js-sdk'
import Location from './utils/location.js'
import Resource from './utils/resource.js'

export function processLinks(elt) {
  if (elt) {
    const linkArray = Array.from(elt.querySelectorAll("a[href]"))
    linkArray
      .forEach(link => {
        try {
          const url = new URL(link.getAttribute("href"))
          if (url.host === window.location.host && url.pathname === window.location.pathname) {
            const hash = url.hash
            link.addEventListener("click", e => {
              e.preventDefault()
              History.push(hash.slice(1))
            })
          } else if (url.host === "matrix.to") {
            const user = Client.client.getUser(url.hash.slice(2))
            link.addEventListener("click", e => e.preventDefault()) // do nothing until we have DMS worked out
            if (user) {
              const colors = new UserColor(user.userId)
              link.style.setProperty('--user_dark', colors.dark)
            } else {
              link.addEventListener("click", async e => {
		e.preventDefault()
		// we go up to find the message event id and use it to
		// set history so the user can come back to the right place
		let parent = link.parentElement
		while (parent && !parent.id) {
		  parent = parent.parentElement
		}
		const messageId = parent ? parent.id : null
		await handleLink(url, messageId)
	      })
            }
          }
        } catch (e) {}
      })
  }
}

async function handleLink(url, messageId) {
  const urlParts = url.hash.slice(2).split('/')
  const roomIdOrAlias = urlParts[0]
  const eventId = urlParts[1] ? urlParts[1].split('?')[0] : null
  if (roomIdOrAlias.startsWith('#')) {
    const result = await Client.client.getRoomIdForAlias(roomIdOrAlias)
    const roomId = result.room_id
    const theRoom = Client.client.getRoom(roomId)
    if (theRoom.isSpaceRoom && Resource.hasResource(theRoom)) {
      const alias = encodeURIComponent(roomIdOrAlias.slice(1))
      History.setPath(4, messageId)
      History.push(`/${alias}`)
    }
  } else if (roomIdOrAlias.startsWith('!')) {
    const roomId = roomIdOrAlias
    const theRoom = Client.client.getRoom(roomId)
    const linkResource = theRoom
	  .getLiveTimeline().getState(Matrix.EventTimeline.BACKWARDS)
	  .getStateEvents(Matrix.EventType.SpaceParent)[0]?.getStateKey()
    const roomAlias = linkResource
	  ? Client.client.getRoom(linkResource)?.getCanonicalAlias()
	  : null
    const linkAnnotation = linkResource
	  ? Client.client.getRoom(linkResource)?.getLiveTimeline().getState(Matrix.EventTimeline.BACKWARDS)
	  .getStateEvents(Matrix.EventType.SpaceChild, theRoom.roomId)
	  : null
    const linkLocation = linkAnnotation ? new Location(linkAnnotation) : null
    const alias = encodeURIComponent(roomAlias.slice(1))
    if (alias) {
      History.setPath(4, messageId)
      History.push(`/${alias}/${linkLocation.getResourcePosition()}/${linkLocation.getChild()}/${eventId ? `${eventId}` : ''}`)
    }
  }
}
