import { h, Fragment, createRef, Component } from 'preact';
import * as Matrix from "matrix-js-sdk"
import Client from './client.js'
import './styles/spacesManager.css'
import Modal from './modal.js'
import Invite from './invite.js'
import Resource from './utils/resource.js'
import RoomSettings from './roomSettings.js'
import * as Icons from './icons.js'
import { RoomColor } from './utils/colors.js'
import { pdfStateType, spaceChild, spaceParent, mscResourceData } from "./constants.js"

export default class SpacesManager extends Component {
  constructor(props) {
    super(props)
    this.state = {
      spaces: Client.client.getVisibleRooms()
        .filter(room => room.getMyMembership() === "join")
        .filter(this.isCollection)
    }
  }

  handleRoom = _ => {
    clearTimeout(this.roomDebounceTimeout)
    this.roomDebounceTimeout = setTimeout(_ => {
      this.setState({
        spaces: Client.client.getVisibleRooms()
          .filter(room => room.getMyMembership() === "join")
          .filter(this.isCollection)
      })
    })
  }

  componentDidMount () {
    Client.client.on("Room", this.handleRoom)
    Client.client.on("Room.name", this.handleRoom)
  }

  componentWillUnmount () {
    Client.client.off("Room", this.handleRoom)
    Client.client.off("Room.name", this.handleRoom)
  }

  searchPush = s => this.props.setSearch(`${this.props.searchFilter} "${s}"`)

  isCollection(room) {
    const roomState = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const creation = roomState.getStateEvents("m.room.create", "")
    const isSpace = creation.getContent()?.type === "m.space"
    return isSpace && !Resource.hasResource(room)
  }

  createCollection = _ => {
    Modal.set(<CreateCollection />)
  }

  render(props, state) {
    return <div id="spaces-manager">
      <h1>Collections</h1>
      <div id="spaces-list">
        {state.spaces.map(room => <SpaceListing searchPush={this.searchPush} narrow={props.narrow} key={room.roomId} room={room} />)}
      </div>
      <div>
        <button onclick={this.createCollection} id="create-space">+ Create New Collection</button>
      </div>
    </div>
  }
}

class CreateCollection extends Component {
  constructor(props) {
    super(props)
    this.state = {
      querying: false,
      nameavailable: false
    }
  }

  mainForm = createRef()

  collectionNameInput = createRef()

  collectionTopicInput = createRef()

  // DRY duplication with pdfUpload
  validateName = _ => {
    clearTimeout(this.namingTimeout)
    this.setState({querying: true})
    this.namingTimeout = setTimeout(_ => {
      Client.client.getRoomIdForAlias(`#${this.toAlias(this.collectionNameInput.current.value)}:${Client.client.getDomain()}`)
        .then(_ => this.setState({querying: false, nameavailable: false}))
        .catch(err => {
          if (this.collectionNameInput.current.value === "") this.setState({querying: false, nameavailable: false})
          else if (err.errcode === "M_NOT_FOUND") this.setState({querying: false, nameavailable: true})
          else alert(err)
        })
    }, 1000)
  }

  toAlias(s) {
    // replace forbidden characters
    return s.replace(/[\s:]/g, '_')
  }

  handleSubmit = async e => {
    e.preventDefault()
    const theName = this.collectionNameInput.current.value
    const theAlias = this.toAlias(theName)
    const theTopic = this.collectionTopicInput.current.value
    await Client.client.createRoom({
      room_alias_name: theAlias,
      visibility: "private",
      name: theName,
      topic: theTopic,
      // We declare the room a space
      creation_content: { type: "m.space" },
      initial_state: [
        // we allow anyone to join, by default, for now
        {
          type: "m.room.join_rules",
          state_key: "",
          content: {join_rule: "public"}
        }
      ]
    }).catch(err => { alert(err); })
    Modal.hide()
  }

  render(_props, state) {
    return <Fragment>
      <h3 id="modalHeader">Create Collection</h3>
      <form ref={this.mainForm} onSubmit={this.handleSubmit} id="create-collection">
        <label for="name">Collection Name</label>
        <input name="name" oninput={this.validateName} ref={this.collectionNameInput} />
        <div class="name-validation-detail">{
          state.querying
            ? "querying..."
            : state.nameavailable
              ? "name available"
              : "name unavailable"
          }
        </div>
        <label for="topic" >Collection Topic</label>
        <textarea name="topic" ref={this.collectionTopicInput} />
        <div id="create-collection-submit">
          <button disabled={state.querying || !state.nameavailable} class="styled-button" ref={this.submitButton} type="submit">
            Create Collection
          </button>
        </div>
      </form>
    </Fragment>
  }
}

class SpaceListing extends Component {
  constructor(props) {
    super(props)
    this.state = {
      actionsVisible: false,
      children: null
    }
  }

  componentDidMount() {
    Client.client.on("RoomState.events", this.handleStateUpdate)
    this.loadChildren()
  }

  componentWillUnmount() {
    Client.client.off("RoomState.events", this.handleStateUpdate)
  }

  async loadChildren() {
    // dendrite will still use the fallback route, which can't restrict depth
    const children = await Client.client.getRoomHierarchy(this.props.room.roomId, 15, 1)
      .then(response => response.rooms.map(child => <SpaceListingChild key={child.roomId} child={child} />))
      .then(allrooms => allrooms.slice(1)) // the root is always first in the listing
    // going to have to handle pagination eventually
    this.setState({children})
  }

  handleStateUpdate = e => {
    if (e.getRoomId() === this.props.room.roomId && e.getType() === spaceChild) {
      this.loadChildren()
      // going to have to handle pagination eventually, insert this rather than redo the whole listing.
    }
  }

  searchMe = _ => this.props.searchPush(`*${this.props.room.name}`)

  toggleActions = _ => this.setState(oldState => { return { actionsVisible: !oldState.actionsVisible } })

  addChild = _ => {
    this.setState({ actionsVisible: false })
    Modal.set(<AddChild room={this.props.room} />)
  }

  openSettings = _ => Modal.set(<RoomSettings room={this.props.room} />)

  openInvite = _ => Modal.set(<Invite roomId={this.props.room.roomId} />)

  roomColor = new RoomColor(this.props.room.name)

  render(props, state) {
    const userMember = props.room.getMember(Client.client.getUserId())
    const isAdmin = userMember.powerLevel >= 100
    // should do this in a more fine-grained way with hasSufficientPowerLevelFor
    return <div style={this.roomColor.styleVariables} class="space-listing">
      <h3>
        <span onclick={this.searchMe}>{props.room.name}</span>
        {isAdmin
          ? <button data-narrow-view={props.narrow} onclick={this.toggleActions}>{Icons.moreVertical}</button>
          : null
        }
      </h3>
      { state.actionsVisible
        ? <div class="space-listing-actions">
            <button class="small-icon" onclick={this.addChild}>{ Icons.newDiscussion }</button>
            <button class="small-icon" onclick={this.openInvite}>{ Icons.userPlus }</button>
            <button class="small-icon" onclick={this.openSettings}>{ Icons.settings }</button>
          </div>
        : null
      }
      <div class="space-listing-children">
        {state.children}
        {isAdmin && props.dragging ? <button ondrop={_ => alert('drop not implemented!')} class="add-child-to-collection">+</button> : null }
      </div>
    </div>
  }
}

class AddChild extends Component {
  constructor(props) {
    super(props)
    this.state = {
      discussions: Client.client.getVisibleRooms()
        .filter(Resource.hasResource)
        .map(room => <DiscussionListing key={room.room_id} room={room} collection={props.room} />)
    }
  }

  render(_props, state) {
    return <Fragment>
      <h3 id="modalHeader">Add Discussion to Collection</h3>
      {state.discussions}
    </Fragment>
  }
}

class DiscussionListing extends Component {
  addMe = async _ => {
    const theDomain = Client.client.getDomain()
    const childContent = { via: [theDomain] }
    const parentContent = { via: [theDomain] }
    await Client.client
      .sendStateEvent(this.props.collection.roomId, spaceChild, childContent, this.props.room.roomId)
      .catch(e => alert(e))
    await Client.client
      .sendStateEvent(this.props.room.roomId, spaceParent, parentContent, this.props.collection.roomId)
      .catch(e => alert(e))
    Modal.hide()
  }

  render(props) {
    return <button class="discussion-listing" onclick={this.addMe}>{props.room.name}</button>
  }
}

class SpaceListingChild extends Component {
  constructor(props) {
    super(props)
    this.state = {
      joined: this.amJoined(),
      loaded: false,
      avatarUrl: props.child.avatar_url
        ? Client.client.mxcUrlToHttp(props.child.avatar_url, 35, 35, "crop")
        : null
    }
  }

  amJoined = _ => !!(Client.client.getRoom(this.props.child.room_id)?.getMyMembership() === "join")

  componentDidMount () {
    Client.client.on("Room", this.handleRoom)
    Client.client.on("RoomState.events", this.handleRoom)
  }

  componentDidUnmount () {
    Client.client.on("Room", this.handleRoom)
    Client.client.on("RoomState.events", this.handleRoom)
  }

  handleRoom = (e, r) => {
    if (e.roomId === this.props.child.room_id || r?.roomId === this.props.child.room_id) {
      clearTimeout(this.roomDebounceTimeout)
      this.roomDebounceTimeout = setTimeout(_ => {
        this.setState({ joined: this.amJoined() })
      })
    }
  }

  joinRoom = _ => Client.client.joinRoom(this.props.child.room_id)

  roomColor = new RoomColor(this.props.child.name)

  render(props, state) {
    return <div onclick={this.joinRoom}
      data-joined={state.joined}
      data-has-avatar={!!state.avatarUrl}
      class="space-listing-child"
      style={this.roomColor.styleVariables}>
        { state.avatarUrl
          ? <img src={state.avatarUrl} />
          : props.child.name.slice(0, 1)
        }
      </div>
  }
}
