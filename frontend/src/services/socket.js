import { io } from 'socket.io-client'

let _socket = null

export function getSocket() {
  if (!_socket) {
    _socket = io('/', { withCredentials: true, autoConnect: false })
  }
  if (!_socket.connected) {
    _socket.connect()
  }
  return _socket
}
