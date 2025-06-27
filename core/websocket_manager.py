"""
Abbey Stock Exchange v5 - WebSocket Manager

This module manages WebSocket connections and real-time communication
between the server and client applications.
"""

import logging
from flask_socketio import emit, disconnect
from flask import request
from datetime import datetime
from decimal import Decimal
import uuid

logger = logging.getLogger('abbey.websocket')


def convert_decimals_to_float(obj):
    """
    Recursively convert Decimal objects to float for JSON serialization.
    
    Args:
        obj: Object that may contain Decimal instances
        
    Returns:
        Object with Decimal instances converted to float
    """
    if isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, dict):
        return {key: convert_decimals_to_float(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_decimals_to_float(item) for item in obj]
    else:
        return obj


class WebSocketManager:
    """
    Manages WebSocket connections and real-time updates for the application.
    
    This class handles client connections, message broadcasting, and
    real-time synchronization of price updates and system events.
    """
    
    def __init__(self, socketio):
        """
        Initialize the WebSocket manager.
        
        Args:
            socketio: Flask-SocketIO instance
        """
        self.socketio = socketio
        self.connected_clients = {}
        self.client_subscriptions = {}
        logger.info("WebSocket Manager initialized")
    
    def register_events(self):
        """Register all WebSocket event handlers."""
        
        @self.socketio.on('connect')
        def handle_connect():
            """Handle client connection."""
            try:
                client_id = str(uuid.uuid4())
                client_info = {
                    'id': client_id,
                    'session_id': request.sid,
                    'connected_at': datetime.now().isoformat(),
                    'ip_address': request.environ.get('REMOTE_ADDR', 'unknown'),
                    'user_agent': request.environ.get('HTTP_USER_AGENT', 'unknown'),
                    'subscriptions': []
                }
                
                self.connected_clients[request.sid] = client_info
                self.client_subscriptions[request.sid] = set()
                
                logger.info(f"Client connected: {client_id} from {client_info['ip_address']}")
                
                # Send initial connection confirmation
                emit('connected', {
                    'client_id': client_id,
                    'server_time': datetime.now().isoformat(),
                    'message': 'Connected to Abbey Stock Exchange'
                })
                
            except Exception as e:
                logger.error(f"Error handling client connection: {e}")
                disconnect()
        
        @self.socketio.on('disconnect')
        def handle_disconnect():
            """Handle client disconnection."""
            try:
                if request.sid in self.connected_clients:
                    client_info = self.connected_clients[request.sid]
                    logger.info(f"Client disconnected: {client_info['id']}")
                    
                    # Clean up client data
                    del self.connected_clients[request.sid]
                    if request.sid in self.client_subscriptions:
                        del self.client_subscriptions[request.sid]
                        
                else:
                    logger.warning(f"Unknown client disconnected: {request.sid}")
                    
            except Exception as e:
                logger.error(f"Error handling client disconnection: {e}")
        
        @self.socketio.on('subscribe')
        def handle_subscribe(data):
            """Handle client subscription to specific events."""
            try:
                if request.sid not in self.connected_clients:
                    emit('error', {'message': 'Client not properly connected'})
                    return
                
                subscription_type = data.get('type')
                if not subscription_type:
                    emit('error', {'message': 'Subscription type required'})
                    return
                
                # Add subscription
                if request.sid not in self.client_subscriptions:
                    self.client_subscriptions[request.sid] = set()
                
                self.client_subscriptions[request.sid].add(subscription_type)
                self.connected_clients[request.sid]['subscriptions'].append(subscription_type)
                
                logger.debug(f"Client {self.connected_clients[request.sid]['id']} subscribed to {subscription_type}")
                
                # Confirm subscription
                emit('subscribed', {
                    'type': subscription_type,
                    'message': f'Subscribed to {subscription_type} updates'
                })
                
            except Exception as e:
                logger.error(f"Error handling subscription: {e}")
                emit('error', {'message': 'Subscription failed'})
        
        @self.socketio.on('unsubscribe')
        def handle_unsubscribe(data):
            """Handle client unsubscription from specific events."""
            try:
                if request.sid not in self.connected_clients:
                    emit('error', {'message': 'Client not properly connected'})
                    return
                
                subscription_type = data.get('type')
                if not subscription_type:
                    emit('error', {'message': 'Subscription type required'})
                    return
                
                # Remove subscription
                if request.sid in self.client_subscriptions:
                    self.client_subscriptions[request.sid].discard(subscription_type)
                    
                    # Update client info
                    if subscription_type in self.connected_clients[request.sid]['subscriptions']:
                        self.connected_clients[request.sid]['subscriptions'].remove(subscription_type)
                
                logger.debug(f"Client {self.connected_clients[request.sid]['id']} unsubscribed from {subscription_type}")
                
                # Confirm unsubscription
                emit('unsubscribed', {
                    'type': subscription_type,
                    'message': f'Unsubscribed from {subscription_type} updates'
                })
                
            except Exception as e:
                logger.error(f"Error handling unsubscription: {e}")
                emit('error', {'message': 'Unsubscription failed'})
        
        @self.socketio.on('ping')
        def handle_ping():
            """Handle ping/keepalive from clients."""
            try:
                if request.sid in self.connected_clients:
                    emit('pong', {
                        'server_time': datetime.now().isoformat(),
                        'client_id': self.connected_clients[request.sid]['id']
                    })
                else:
                    emit('error', {'message': 'Client not properly connected'})
                    
            except Exception as e:
                logger.error(f"Error handling ping: {e}")
        
        logger.info("WebSocket events registered")
    
    def get_connected_clients(self):
        """
        Get list of connected clients.
        
        Returns:
            dict: Connected clients information
        """
        return self.connected_clients.copy()
    
    def broadcast_price_update(self, update_data):
        """
        Broadcast price updates to all connected clients.
        
        Args:
            update_data (dict): Updated drink information with changes
        """
        try:
            if not self.connected_clients:
                logger.debug("No connected clients for price update broadcast")
                return
            
            # Convert Decimal objects to float for JSON serialization
            serializable_drinks = convert_decimals_to_float(update_data.get('drinks', []))
            serializable_changes = convert_decimals_to_float(update_data.get('changes', {}))
            
            # Prepare broadcast message
            message = {
                'type': 'price_update',
                'timestamp': update_data.get('timestamp', datetime.now().isoformat()),
                'drinks': serializable_drinks,
                'changes': serializable_changes,
                'change_count': len(update_data.get('changes', {}))
            }
            
            # Broadcast to all subscribed clients
            broadcast_count = 0
            for session_id, subscriptions in self.client_subscriptions.items():
                if 'price_updates' in subscriptions:
                    self.socketio.emit('price_update', message, room=session_id)
                    broadcast_count += 1
            
            logger.info(f"Price update broadcasted to {broadcast_count} clients with {len(serializable_drinks)} drinks")
            
        except Exception as e:
            logger.error(f"Error broadcasting price update: {e}")
            import traceback
            logger.error(f"WebSocket broadcast error traceback: {traceback.format_exc()}")
    
    def broadcast_timer_update(self, timer_data):
        """
        Broadcast timer/refresh cycle updates to all connected clients.
        
        Args:
            timer_data (dict): Timer information with refresh_cycle and time_remaining
        """
        try:
            if not self.connected_clients:
                logger.debug("No connected clients for timer update broadcast")
                return
            
            # Prepare broadcast message
            message = {
                'type': 'timer_update',
                'timestamp': datetime.now().isoformat(),
                'refresh_cycle': timer_data.get('refresh_cycle'),
                'time_remaining': timer_data.get('time_remaining')
            }
            
            # Broadcast to all subscribed clients
            broadcast_count = 0
            for session_id, subscriptions in self.client_subscriptions.items():
                if 'timer_updates' in subscriptions or 'price_updates' in subscriptions:
                    self.socketio.emit('refresh_timer', message, room=session_id)
                    broadcast_count += 1
            
            logger.info(f"Timer update broadcasted to {broadcast_count} clients")
            
        except Exception as e:
            logger.error(f"Error broadcasting timer update: {e}")
    
    def broadcast_system_status(self, status_data):
        """
        Broadcast system status updates.
        
        Args:
            status_data (dict): System status information
        """
        try:
            if not self.connected_clients:
                logger.debug("No connected clients for status broadcast")
                return
            
            # Prepare broadcast message
            message = {
                'type': 'system_status',
                'timestamp': datetime.now().isoformat(),
                'status': status_data
            }
            
            # Broadcast to all subscribed clients
            broadcast_count = 0
            for session_id, subscriptions in self.client_subscriptions.items():
                if 'system_status' in subscriptions:
                    self.socketio.emit('system_status', message, room=session_id)
                    broadcast_count += 1
            
            logger.debug(f"System status broadcasted to {broadcast_count} clients")
            
        except Exception as e:
            logger.error(f"Error broadcasting system status: {e}")
    
    def broadcast_refresh_timer(self, timer_data):
        """
        Broadcast refresh timer updates to all connected clients.
        
        Args:
            timer_data (dict): Timer information (time_remaining, next_refresh)
        """
        try:
            if not self.connected_clients:
                return
            
            # Prepare broadcast message
            message = {
                'type': 'refresh_timer',
                'timestamp': datetime.now().isoformat(),
                'time_remaining': timer_data.get('time_remaining'),
                'next_refresh': timer_data.get('next_refresh'),
                'refresh_cycle': timer_data.get('refresh_cycle')
            }
            
            # Broadcast to all subscribed clients
            broadcast_count = 0
            for session_id, subscriptions in self.client_subscriptions.items():
                if 'timer_updates' in subscriptions:
                    self.socketio.emit('refresh_timer', message, room=session_id)
                    broadcast_count += 1
            
            logger.debug(f"Timer update broadcasted to {broadcast_count} clients")
            
        except Exception as e:
            logger.error(f"Error broadcasting timer update: {e}")
    
    def send_to_client(self, session_id, event, data):
        """
        Send a message to a specific client.
        
        Args:
            session_id (str): Client session ID
            event (str): Event name
            data (dict): Data to send
        """
        try:
            if session_id in self.connected_clients:
                self.socketio.emit(event, data, room=session_id)
                logger.debug(f"Message sent to client {self.connected_clients[session_id]['id']}: {event}")
            else:
                logger.warning(f"Attempted to send message to unknown client: {session_id}")
                
        except Exception as e:
            logger.error(f"Error sending message to client: {e}")
    
    def get_client_count(self):
        """
        Get the number of connected clients.
        
        Returns:
            int: Number of connected clients
        """
        return len(self.connected_clients)
    
    def get_subscription_stats(self):
        """
        Get statistics about client subscriptions.
        
        Returns:
            dict: Subscription statistics
        """
        try:
            subscription_counts = {}
            total_subscriptions = 0
            
            for subscriptions in self.client_subscriptions.values():
                total_subscriptions += len(subscriptions)
                for sub_type in subscriptions:
                    subscription_counts[sub_type] = subscription_counts.get(sub_type, 0) + 1
            
            return {
                'total_clients': len(self.connected_clients),
                'total_subscriptions': total_subscriptions,
                'subscription_types': subscription_counts
            }
            
        except Exception as e:
            logger.error(f"Error getting subscription stats: {e}")
            return {
                'total_clients': 0,
                'total_subscriptions': 0,
                'subscription_types': {},
                'error': str(e)
            }
    
    def cleanup_inactive_clients(self):
        """
        Clean up inactive or stale client connections.
        This should be called periodically to maintain connection health.
        """
        try:
            # This would typically check for stale connections
            # For now, we'll just log the current state
            logger.debug(f"Active clients: {len(self.connected_clients)}")
            
        except Exception as e:
            logger.error(f"Error cleaning up inactive clients: {e}")
    
    def is_client_subscribed(self, session_id, subscription_type):
        """
        Check if a client is subscribed to a specific event type.
        
        Args:
            session_id (str): Client session ID
            subscription_type (str): Subscription type to check
            
        Returns:
            bool: True if subscribed, False otherwise
        """
        try:
            if session_id in self.client_subscriptions:
                return subscription_type in self.client_subscriptions[session_id]
            return False
            
        except Exception as e:
            logger.error(f"Error checking client subscription: {e}")
            return False