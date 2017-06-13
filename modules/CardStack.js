/* @flow */
/* eslint no-duplicate-imports: 0 */
/* eslint react/no-unused-prop-types: 0 */

import React from 'react'
import { BackHandler, BackAndroid } from 'react-native'
import { matchPath } from 'react-router'
import { StateUtils } from 'react-navigation'
import type { RouterHistory, Location } from 'react-router'
import type { CardsRendererProps, NavigationState, Card } from './TypeDefinitions'
import * as StackUtils from './StackUtils'
import * as HistoryUtils from './HistoryUtils'

const buildNavigationState = (
  location: Location,
  entries: Array<Location>,
  cards: Array<Card>,
): NavigationState<{}> => {
  return entries.reduce((state, entry) => {
    const card = cards.find(({ path, exact, strict }) => {
      return matchPath(entry.pathname, { path, exact, strict })
    })
    if (!card || !card.path) return { index: -1, routes: [] }
    const route = StackUtils.getRoute(cards, entry)
    if (!route) return { index: -1, routes: [] }
    return {
      index: matchPath(location.pathname, card)
        ? state.routes.length
        : state.index,
      routes: [
        ...state.routes,
        route,
      ],
    }
  }, { index: -1, routes: [] })
}

type State = {
  key: number,
  navigationState: NavigationState<{}>,
  cards: Array<Card>,
}

type Props = {
  history: RouterHistory, // eslint-disable-next-line
  children?: Array<React$Element<any>>,
  render: (props: CardsRendererProps) => React$Element<any>,
}

class CardStack extends React.PureComponent<void, Props, State> {

  props: Props
  state: State

  unlistenHistory: Function

  constructor(props: Props): void {
    super(props)
    // Build the card stack
    const { children, history: { entries, index, location } } = props
    const cards = children && StackUtils.build(children)
    // CardStack can be mount ?
    if (!cards) throw new Error('No initial route found')
    if (!entries || index === undefined) throw new Error('No history entries found')
    // Build navigation state
    const navigationState = buildNavigationState(location, entries, cards)
    // Set key
    const key = 0
    // Save everything in component state
    this.state = { navigationState, cards, key }
  }

  // Listen hardware BackHandler event + history event
  componentDidMount(): void {
    const { history } = this.props
    this.unlistenHistory = HistoryUtils.runHistoryListenner(history, this.onListenHistory)
    (BackAndroid || BackHandler).addEventListener('hardwareBackPress', this.onNavigateBack)
  }

  // Remove all listeners
  componentWillUnmount(): void {
    this.unlistenHistory()
    (BackAndroid || BackHandler).removeEventListener('hardwareBackPress', this.onNavigateBack)
  }

  // Update cards
  componentWillReceiveProps(nextProps: Props): void {
    const { children, history: { entries, location } } = nextProps
    const { cards, navigationState } = this.state
    // Rebuild cards<x
    const nextCards = children && StackUtils.build(children, cards)
    // Get current route
    const route = navigationState.routes[navigationState.index]
    // Get current card
    const card = StackUtils.get(nextCards, route)
    if (entries && card && !card.path) {
      // Build cards from scratch
      const newCards = children && StackUtils.build(children)
      if (!newCards) throw new Error('Can\'t rebuild cards')
      const newNavigationState = buildNavigationState(location, entries, newCards)
      // Update state + rebuild navigation state
      this.setState(prevState => ({
        key: prevState.key + 1,
        cards: newCards,
        navigationState: newNavigationState,
      }))
    } else {
      // Update state
      this.setState({ cards: nextCards })
    }
  }

  // Update navigation state
  onListenHistory = (history: RouterHistory, nextHistory: RouterHistory): void => {
    const { location, entries, index } = history
    const { location: nextLocation, action, index: nextIndex } = nextHistory
    const { navigationState, cards } = this.state
    // Get current card
    const currentRoute = navigationState.routes[navigationState.index]
    const currentCard = cards.find(({ key }) => key === currentRoute.routeName)
    // Get next card
    const nextRoute = StackUtils.getRoute(cards, nextLocation)
    if (!nextRoute) return
    const nextCard = cards.find(({ key }) => key === nextRoute.routeName)
    // Local state must be updated ?
    if (
      currentCard && nextCard &&
      StackUtils.shouldUpdate(currentCard, nextCard, location, nextLocation)
    ) {
      const key = StackUtils.createKey(nextRoute)
      switch (action) {
        case 'PUSH': {
          this.setState(state => ({
            navigationState: StateUtils.push(
              state.navigationState,
              { ...nextRoute, key },
            ),
          }))
          break
        }
        case 'POP': {
          if (
            index === undefined ||
            nextIndex === undefined ||
            entries === undefined
          ) {
            return
          }
          const n = index - nextIndex
          if (n > 1) {
            this.setState(state => ({
              navigationState: StateUtils.reset(
                state.navigationState,
                state.navigationState.routes.slice(
                  0,
                  (state.navigationState.index - n) + 1,
                ),
                state.navigationState.index - n,
              ),
            }))
          } else {
            this.setState(state => ({
              navigationState: StateUtils.pop(state.navigationState),
            }))
          }
          break
        }
        case 'REPLACE': {
          this.setState(state => ({
            navigationState: StateUtils.replaceAtIndex(
              state.navigationState,
              state.navigationState.index,
              { ...nextRoute, key },
            ),
          }))
          break
        }
        default:
      }
    }
  }

  // Pop to previous scene (n-1)
  onNavigateBack = (): boolean => {
    if (this.state.navigationState.index > 0) {
      this.props.history.goBack()
      return true
    }
    return false
  }

  // Render view
  render(): React$Element<any> {
    return this.props.render({
      ...this.state,
      history: this.props.history,
      onNavigateBack: this.onNavigateBack,
    })
  }

}

export default CardStack
