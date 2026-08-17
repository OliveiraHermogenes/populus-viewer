import { h, render, Fragment, Component } from 'preact'
import Router from 'preact-router'
import WelcomeView from './welcome.js'
import LoginView from './login.js'
import ContentView from './contentView.js'
import SplashView from './splash.js'
import Modal from './modal.js'
import Toast from './toast.js'
import History from './history.js'
import Client from './client.js'
import './assets.js'
import './styles/global.css'
import './styles/colors.css'

class PopulusViewer extends Component {
  constructor () {
    super()
    this.state = {
      initializationStage: 'connecting to database',
      loggedIn: true
      // the presumption is that we're logged in until it's clear that we're
      // not. This avoids flashing the login view while verifying that we're
      // logged in.
    }
    const queryParameters = new URLSearchParams(window.location.search)
    this.loginToken = queryParameters.get('loginToken')
    if (localStorage.getItem('scrollbars')) document.documentElement.dataset.scrollbars = localStorage.getItem('scrollbars')
    else document.documentElement.dataset.scrollbars = 'hidden'
    if (Client.isResumable()) Client.initClient().then(this.loginHandler)
    else if (this.loginToken) {
      Client.initClient().then(_ => Client.client.loginRequest({
        type: 'm.login.token',
        token: this.loginToken
      }))
        .then(loginResponse => {
          localStorage.setItem('accessToken', loginResponse.access_token)
          localStorage.setItem('userId', loginResponse.user_id)
          localStorage.setItem('deviceId', loginResponse.device_id)
          return Client.initClient()
        })
        .then(this.loginHandler)
    } else this.setState({ loggedIn: false })
  }

  setInitializationStage = s => this.setState({ initializationStage: s })

  logoutHandler = _ => {
    localStorage.clear()
    Client.restart()
    this.setState({ loggedIn: false })
  }

  loginHandler = _ => {
    Client.client.on('Session.logged_out', this.logoutHandler)
    localStorage.setItem('accessToken', Client.client.getAccessToken())
    localStorage.setItem('userId', Client.client.getUserId())
    localStorage.setItem('deviceId', Client.client.deviceId)
    Client.client.startClient().then(_ => {
      Client.client.getMediaConfig().then(conf => { Client.mediaConfig = conf })
      this.setState({
        initializationStage: 'performing initial sync',
        loggedIn: true
      })
    })
  }

  render (_props, state) {
    const content = !state.loggedIn
      ? <LoginView loginHandler={this.loginHandler} />
      : !(state.initializationStage === 'initialized')
          ? <SplashView
            initializationStage={state.initializationStage}
            setInitializationStage={this.setInitializationStage}
            logoutHandler={this.logoutHandler} />
          : <Router history={History.history}>
          <WelcomeView path="/" logoutHandler={this.logoutHandler} />
          <ContentView path="/:resourceAlias/:resourcePosition?/:roomFocused?/:eventFocused?" />
        </Router>
    return <Fragment>
        <Modal />
        <Toast />
        { content }
    </Fragment>
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').then(_ => {
      console.log('[Service Worker] registered')
    }).catch(registrationError => {
      console.log('[Service Worker] failed to register: ', registrationError)
    })
  })
  // listen for auth info requests from service worker
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ASK_AUTH_INFO') {
      navigator.serviceWorker.ready.then((registration) => {
        registration.active.postMessage({
          type: 'REPLY_AUTH_INFO',
          auth: {
            accessToken: localStorage.getItem('accessToken'),
            baseUrl: localStorage.getItem('baseUrl')
          }
        })
      })
    }
  })
}

function recaptchaHandler (recaptchaToken) {
  window.dispatchEvent(new CustomEvent('recaptcha', { detail: recaptchaToken }))
}

window.recaptchaHandler = recaptchaHandler // needs to be global for the google callback

render(<PopulusViewer />, document.body)
