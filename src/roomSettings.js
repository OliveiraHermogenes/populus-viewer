import { h, Component, createRef, Fragment } from 'preact';
import Client from './client.js'
import * as Matrix from "matrix-js-sdk"
import { loadImageElement } from "./utils/media.js"
import Location from './utils/location.js'
import Modal from './modal.js'
import { mscLocation, joinRule, spaceParent, populusHighlight, spaceChild } from './constants.js';
import "./styles/roomSettings.css"

export default class RoomSettings extends Component {
  constructor(props) {
    super(props)
    this.roomState = props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    this.initialJoinRule = this.roomState.getJoinRule()
    this.initialName = props.room.name
    this.initialVisibility = null
    this.joinLink = `${window.location.protocol}//${window.location.hostname}${window.location.pathname}` +
      `?join=${encodeURIComponent(props.room.roomId)}&via=${Client.client.getDomain()}`
    this.state = {
      previewUrl: props.room.getAvatarUrl(`https://${Client.client.getDomain()}`, 300, 300, "crop"),
      joinRule: this.initialJoinRule,
      roomName: this.initialName,
      visibility: null,
      references: null,
      view: "APPEARANCE"
    }
  }

  componentDidMount () {
    this.initialize()
  }

  avatarImageInput = createRef()

  async initialize() {
    const visibility = await Client.client.getRoomDirectoryVisibility(this.props.room.roomId)
    this.initialVisibility = visibility
    const references = this.roomState.getStateEvents(spaceParent)
    this.setState({ references, visibility: visibility.visibility })
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

  handleUploadAvatar = _ => this.avatarImageInput.current.click()

  handleVisibilityChange = e => {
    this.setState({ visibility: e.target.value })
  }

  progressHandler = (progress) => this.setState({progress})

  handleSubmit = async e => {
    e.preventDefault()
    const theImage = this.avatarImageInput.current.files[0]
    if (this.state.visibility !== this.initialVisibility) await Client.client.setRoomDirectoryVisibility(this.props.room.roomId, this.state.visibility).catch(this.raiseErr)
    if (this.state.joinRule !== this.initialJoinRule) await this.updateJoinRule()
    if (this.state.roomName !== this.initialRoomName) await Client.client.setRoomName(this.props.room.roomId, this.state.roomName).catch(this.raiseErr)
    if (theImage && /^image/.test(theImage.type)) {
      const {width, height} = await loadImageElement(theImage)
      await Client.client.uploadContent(theImage, { progressHandler: this.progressHandler })
        .then(e => Client.client
          .sendStateEvent(this.props.room.roomId, "m.room.avatar", {
            info: {
              w: width,
              h: height,
              mimetype: theImage.type ? theImage.type : "application/octet-stream",
              size: theImage.size
            },
            url: e
          }, "")
        )
    } else if (!this.state.previewUrl) {
      Client.client.sendStateEvent(this.props.room.roomId, "m.room.avatar", {}, "")
    }
    Modal.hide()
  }

  raiseErr = _ => alert("Something went wrong. You may not have permission to adjust some of these settings.")

  updatePreview = _ => {
    const theImage = this.avatarImageInput.current.files[0]
    if (theImage && /^image/.test(theImage.type)) {
      this.setState({previewUrl: URL.createObjectURL(this.avatarImageInput.current.files[0]) })
    }
  }

  async updateJoinRule() {
    const theContent = { join_rule: this.state.joinRule }
    await Client.client.sendStateEvent(this.props.room.roomId, joinRule, theContent, "").catch(this.raiseErr)
    if (this.state.joinRule === "public") this.publishReferences()
    if (this.state.joinRule === "invite") this.hideReferences()
  }

  publishReferences() {
    const theDomain = Client.client.getDomain()
    for (const reference of this.state.references) {
      const theLocation = new Location(reference)
      if (!theLocation.isValid()) continue
      const childContent = {
        via: [theDomain],
        [mscLocation]: theLocation.location
      }
      Client.client
        .sendStateEvent(theLocation.getParent(), spaceChild, childContent, this.props.room.roomId)
        .catch(e => alert(e))
    }
  }

  hideReferences() {
    for (const reference of this.state.references) {
      const theLocation = new Location(reference)
      if (!theLocation.isValid()) continue
      const childContent = {}
      Client.client
        .sendStateEvent(theLocation.getParent(), spaceChild, childContent, this.props.room.roomId)
        .catch(e => alert(e))
    }
  }

  showAppearance = _ => this.setState({view: "APPEARANCE"})

  showAccess = _ => this.setState({view: "ACCESS"})

  showLinks = _ => this.setState({view: "LINKS"})

  uploadAvatar = _ => this.avatarImageInput.current.click()

  removeAvatar = _ => this.setState({ previewUrl: null })

  getHeight = _ => {
    switch (this.state.view) {
      case "APPEARANCE" : return "290px"
      case "ACCESS" : return "180px"
      case "LINKS" : return "110px"
    }
  }

  cancel = e => {
    e.preventDefault()
    Modal.hide()
  }

  render(props, state) {
    return <Fragment>
      <h3 id="modalHeader">Room Settings</h3>
      <div id="room-settings-select-view" class="select-view">
        <button onClick={this.showAppearance} data-current-button={state.view==="APPEARANCE"}>Appearance</button>
        <button onClick={this.showAccess} data-current-button={state.view==="ACCESS"}>Access</button>
        {props.joinLink ? <button onClick={this.showLinks} data-current-button={state.view==="LINKS"}>Links</button> : null}
      </div>
      <form 
        style={{height: this.getHeight()}}
        id="room-settings-form">
        {state.view === "APPEARANCE"
          ? <Fragment>
            <label htmlFor="room-avatar">Room Avatar</label>
            {state.previewUrl
              ? <img onclick={this.handleUploadAvatar} id="room-settings-avatar-selector" src={state.previewUrl} />
              : <div key="room-settings-avatar-selector" onclick={this.uploadAvatar} id="room-settings-avatar-selector" />}
            <input name="room-avatar" id="room-avatar-selector-hidden" onchange={this.updatePreview} ref={this.avatarImageInput} accept="image/*" type="file" />
            <div id="room-settings-avatar-info" />
            <label htmlFor="room-name">Room Name</label>
            <input name="room-name"
              type="text"
              class="styled-input"
              value={state.roomName}
              onkeydown={this.handleKeydown}
              onInput={this.handleNameInput} />
            <div id="room-settings-name-info" />
          </Fragment>
          : state.view === "ACCESS"
          ? <Fragment>
            <label htmlFor="visibilty">Visibility</label>
            <select disabled={!state.visibility} class="styled-input" value={state.visibility} name="joinRule" onchange={this.handleVisibilityChange}>
              <option value="private">Private</option>
              <option value="public">Publically Listed</option>
            </select>
            <div id="room-settings-visibility-info">
              {state.visibility === "public"
                ? "the room will appear in public listings"
                : "the room will be hidden from other users"
              }
            </div>
            <label htmlFor="joinRule">Join Rule</label>
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
          </Fragment>
          : state.view === "LINKS" ? <Fragment>
              <label>Join Link</label>
              <pre id="room-settings-join-link">{this.joinLink}</pre>
              <div class="room-settings-link-info">
                Clicking this link will cause an attempt to join this room
              </div>
            </Fragment>
          : null
        }
        <div id="room-settings-submit-wrapper">
          <button className="styled-button" onClick={this.handleSubmit} >Save Changes</button>
          <button className="styled-button" onClick={this.cancel} >Cancel</button>
          {state.previewUrl ? <button class="styled-button" type="button" onclick={this.removeAvatar}>Remove Avatar</button> : null}
        </div>
        {this.state.progress
          ? <div id="room-settings-progress">
            <progress class="styled-progress" max={state.progress.total} value={state.progress.loaded} />
          </div>
          : null
        }
      </form>
    </Fragment>
  }
}
