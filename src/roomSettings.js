import { h, Component, Fragment } from 'preact';
import Client from './client.js'
import * as Matrix from "matrix-js-sdk"
import { eventVersion, joinRule, spaceParent, spaceChild } from './constants.js';
import "./styles/roomSettings.css"

export default class RoomSettings extends Component {
  constructor(props) {
    super(props)
    this.roomState = props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    this.initialJoinRule = this.roomState.getJoinRule()
    this.initialName = props.room.name
    this.initialVisibility = null
    this.state = {
      joinRule: this.initialJoinRule,
      roomName: this.initialName,
      visibility: null,
      references: null
    }
  }

  componentDidMount () {
    this.initialize()
  }

  async initialize() {
    const visibility = await Client.client.getRoomDirectoryVisibility(this.props.room.roomId)
    this.initialVisibility = visibility
    const parents = this.roomState.getStateEvents(spaceParent)
    const references = parents.map(parent => {
      const parentRoom = Client.client.getRoom(parent.getStateKey())
      const reference = parentRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS).getStateEvents(spaceChild, this.props.room.roomId)
      return reference
    })
    this.setState({
      references,
      visibility: visibility.visibility
    })
  }

  handleJoinRuleChange = e => {
    this.setState({ joinRule: e.target.value })
  }

  handleNameInput = e => {
    this.setState({ roomName: e.target.value })
  }

  handleKeydown = e => {
    e.stopPropagation() // don't go to global keypress handler
  }

  handleVisibilityChange = e => {
    this.setState({ visibility: e.target.value })
  }

  raiseErr = _ => alert("Something went wrong. You may not have permission to adjust some of these settings.")

  handleSubmit = async e => {
    e.preventDefault()
    if (this.state.visibility !== this.initialVisibility) await Client.client.setRoomDirectoryVisibility(this.props.room.roomId, this.state.visibility).catch(this.raiseErr)
    if (this.state.joinRule !== this.initialJoinRule) await this.updateJoinRule()
    if (this.state.roomName !== this.initialRoomName) await Client.client.setRoomName(this.props.room.roomId, this.state.roomName).catch(this.raiseErr)
    this.props.populateModal(null)
  }

  async updateJoinRule() {
    const theContent = { join_rule: this.state.joinRule }
    await Client.client.sendStateEvent(this.props.room.roomId, joinRule, theContent, "").catch(this.raiseErr)
    if (this.state.joinRule === "public") this.publishReferences()
    if (this.state.joinRule === "invite") this.hideReferences()
  }

  publishReferences() {
    const theDomain = Client.client.getDomain()
    this.state.references.forEach(reference => {
      const theContent = reference.getContent()
      if (!theContent[eventVersion]) return
      if (!theContent[eventVersion].private) return
      delete theContent[eventVersion].private
      const childContent = {
        via: [theDomain],
        [eventVersion]: theContent[eventVersion]
      }
      Client.client
        .sendStateEvent(reference.getRoomId(), spaceChild, childContent, this.props.room.roomId)
        .catch(e => alert(e))
    })
  }

  hideReferences() {
    const theDomain = Client.client.getDomain()
    this.state.references.forEach(reference => {
      const theContent = reference.getContent()
      if (!theContent[eventVersion]) return
      if (theContent[eventVersion].private) return
      theContent[eventVersion].private = true
      const childContent = {
        via: [theDomain],
        [eventVersion]: theContent[eventVersion]
      }
      Client.client
        .sendStateEvent(reference.getRoomId(), spaceChild, childContent, this.props.room.roomId)
        .catch(e => alert(e))
    })
  }

  cancel = e => {
    e.preventDefault()
    this.props.populateModal(null)
  }

  render(props, state) {
    if (state.visibility) {
      return <Fragment>
        <h3 id="modalHeader">Room Settings</h3>
        <form id="room-settings-form">
          <label htmlFor="room-name">Room Name</label>
          <input name="room-name"
            type="text"
            class="styled-input"
            value={state.roomName}
            onkeydown={this.handleKeydown}
            onInput={this.handleNameInput} />
          <div id="room-settings-name-info" />
          <label htmlFor="visibilty">Visibility:</label>
          <select class="styled-input" value={state.visibility} name="joinRule" onchange={this.handleVisibilityChange}>
            <option value="private">Private</option>
            <option value="public">Publically Listed</option>
          </select>
          <div id="room-settings-visibility-info">
            {state.visibility === "public"
              ? "the room will appear in public listings"
              : "the room will be hidden from other users"
            }
          </div>
          <label htmlFor="joinRule">Join Rule:</label>
          <select class="styled-input" value={state.joinRule} name="joinRule" onchange={this.handleJoinRuleChange}>
            <option value="public">Public</option>
            <option value="invite">Invite-Only</option>
          </select>
          <div id="room-settings-join-info">
            {state.joinRule === "public"
              ? "anyone who can find the room may join"
              : "an explicit invitation is required before joining"
            }
          </div>
          <div id="room-settings-submit-wrapper">
            <button className="styled-button" onClick={this.handleSubmit} >Save Changes</button>
            <button className="styled-button" onClick={this.cancel} >Cancel</button>
          </div>
        </form>
      </Fragment>
    }
    return <span id="settings-loading">loading...</span>
  }
}
