"""
Abbey Stock Exchange v5 - Price Engine

This module implements the core price calculation algorithm and
scheduling system for the Abbey Stock Exchange.
"""

import logging
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger('abbey.price_engine')


class PriceEngine:
    """
    Core price calculation and scheduling engine.
    
    Implements the dynamic pricing algorithm where drinks with sales
    increase in price and drinks without sales decrease in price.
    """
    
    def __init__(self, data_manager, websocket_manager, config):
        """
        Initialize the price engine.
        
        Args:
            data_manager: Data management instance
            websocket_manager: WebSocket management instance
            config: Application configuration
        """
        self.data_manager = data_manager
        self.websocket_manager = websocket_manager
        self.config = config
        self.scheduler = BackgroundScheduler()
        self.is_running_flag = False
        self.current_job = None
        self.next_refresh_time = None
        
        logger.info("Price Engine initialized")
    
    def start(self):
        """Start the price engine and scheduler."""
        try:
            if self.is_running_flag:
                logger.warning("Price Engine is already running")
                return
            
            # Start the scheduler
            self.scheduler.start()
            logger.info("APScheduler started successfully")
            
            # Get refresh cycle from settings
            settings = self.data_manager.get_settings()
            refresh_cycle = settings.get('refresh_cycle', self.config.get('DEFAULT_REFRESH_CYCLE', 300))
            logger.info(f"Loaded refresh cycle from settings: {refresh_cycle}s")
            
            # Schedule the price update job
            self.current_job = self.scheduler.add_job(
                self._process_price_update,
                trigger=IntervalTrigger(seconds=refresh_cycle),
                id='price_update',
                replace_existing=True,
                max_instances=1
            )
            logger.info(f"Scheduled price update job with {refresh_cycle}s interval")
            
            # Calculate next refresh time
            self.next_refresh_time = datetime.now() + timedelta(seconds=refresh_cycle)
            
            self.is_running_flag = True
            logger.info(f"Price Engine started successfully - next cycle at {self.next_refresh_time.strftime('%H:%M:%S')}")
            
            # Log current scheduler status
            jobs = self.scheduler.get_jobs()
            logger.info(f"Active APScheduler jobs: {len(jobs)} - {[job.id for job in jobs]}")
            
            # Add periodic scheduler health check
            self.scheduler.add_job(
                self._scheduler_health_check,
                trigger=IntervalTrigger(seconds=30),
                id='scheduler_health_check',
                replace_existing=True,
                max_instances=1
            )
            logger.info("Added scheduler health check job (every 30 seconds)")
            
        except Exception as e:
            logger.error(f"Failed to start Price Engine: {e}")
            self.is_running_flag = False
            raise
    
    def stop(self):
        """Stop the price engine and scheduler."""
        try:
            if not self.is_running_flag:
                logger.warning("Price Engine is not running")
                return
            
            # Remove the scheduled job
            if self.current_job:
                self.scheduler.remove_job('price_update')
                self.current_job = None
            
            # Shutdown the scheduler
            self.scheduler.shutdown(wait=True)
            
            self.is_running_flag = False
            self.next_refresh_time = None
            logger.info("Price Engine stopped")
            
        except Exception as e:
            logger.error(f"Failed to stop Price Engine: {e}")
            raise
    
    def is_running(self):
        """
        Check if the price engine is running.
        
        Returns:
            bool: True if running, False otherwise
        """
        return self.is_running_flag
    
    def calculate_price_updates(self):
        """
        Calculate price updates based on sales data.
        
        Implements the core algorithm:
        - Items with ≥1 sales increase by Price Step Size
        - Items with 0 sales decrease by Price Step Size (minimum: Minimum Price)
        
        Returns:
            dict: Updated price data with trend information
        """
        try:
            drinks = self.data_manager.get_drinks()
            updated_drinks = []
            price_changes = {}
            
            for drink in drinks:
                old_price = drink['current_price']
                sales_count = drink.get('sales_count', 0)
                drink_name = drink.get('name', 'Unknown')
                
                # Apply price algorithm based on sales during this cycle
                if sales_count >= 1:
                    # Had sales during cycle - increase price
                    new_price = old_price + drink['price_step_size']
                    logger.debug(f"Processing {drink_name}: Had {sales_count} sales → PRICE UP ${old_price:.2f} → ${new_price:.2f}")
                else:
                    # No sales during cycle - decrease price (down to minimum)
                    new_price = max(
                        old_price - drink['price_step_size'],
                        drink['minimum_price']
                    )
                    action = "PRICE DOWN" if new_price < old_price else "AT MINIMUM"
                    logger.debug(f"Processing {drink_name}: No sales → {action} ${old_price:.2f} → ${new_price:.2f}")
                
                # Update drink data
                updated_drink = drink.copy()
                updated_drink['current_price'] = new_price
                # Note: trend is now calculated client-side based on FR-003.5 requirements
                # Remove trend field from server updates to avoid conflicts
                if 'trend' in updated_drink:
                    del updated_drink['trend']
                
                # Handle sales history for rolling trend calculation
                self._update_sales_history(updated_drink, sales_count)
                
                updated_drink['sales_count'] = 0  # Reset sales count
                # Remove last_updated field - not part of schema
                
                updated_drinks.append(updated_drink)
                
                # Track changes for notifications
                if new_price != old_price:
                    drink_id = drink.get('id', drink.get('drink_id', f'drink_{len(updated_drinks)}'))
                    price_changes[drink_id] = {
                        'name': drink['name'],
                        'old_price': float(old_price),  # Convert Decimal to float for JSON
                        'new_price': float(new_price),  # Convert Decimal to float for JSON
                        'sales_count': sales_count
                    }
            
            # Calculate cycle summary
            drinks_with_sales = sum(1 for d in drinks if d.get('sales_count', 0) > 0)
            drinks_no_sales = len(drinks) - drinks_with_sales
            
            logger.info(f"Price cycle completed: {drinks_with_sales} drinks had sales (↗), {drinks_no_sales} had no sales (↘), {len(price_changes)} prices changed")
            return {
                'drinks': updated_drinks,
                'changes': price_changes,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to calculate price updates: {e}")
            raise
    
    def get_next_refresh_time(self):
        """
        Get the timestamp of the next price refresh.
        
        Returns:
            datetime: Next refresh timestamp or None if not running
        """
        return self.next_refresh_time
    
    def update_refresh_cycle(self, new_cycle_seconds):
        """
        Update the refresh cycle and reschedule if running.
        
        Args:
            new_cycle_seconds (int): New refresh cycle in seconds
        """
        try:
            if self.is_running_flag:
                # Remove existing job
                if self.current_job:
                    self.scheduler.remove_job('price_update')
                
                # Add new job with updated interval
                self.current_job = self.scheduler.add_job(
                    self._process_price_update,
                    trigger=IntervalTrigger(seconds=new_cycle_seconds),
                    id='price_update',
                    replace_existing=True,
                    max_instances=1
                )
                
                # Update next refresh time
                self.next_refresh_time = datetime.now() + timedelta(seconds=new_cycle_seconds)
                
                logger.info(f"Price Engine refresh cycle updated to {new_cycle_seconds}s")
            
        except Exception as e:
            logger.error(f"Failed to update refresh cycle: {e}")
            raise
    
    def _process_price_update(self):
        """
        Internal method to process scheduled price updates.
        Called by APScheduler on the configured interval.
        """
        try:
            logger.info("🔄 APScheduler triggered: Processing scheduled price update")
            logger.info("⏰ PRICE ENGINE CYCLE STARTING")
            
            # Get current drinks to analyze
            current_drinks = self.data_manager.get_drinks()
            logger.info(f"📊 Current state: {len(current_drinks)} drinks loaded from data manager")
            
            # Add detailed logging for each drink's current state
            for drink in current_drinks:
                logger.info(f"📋 {drink['name']}: price=${drink['current_price']}, sales_count={drink.get('sales_count', 0)}, min=${drink['minimum_price']}")
            
            # Log current sales state before processing
            drinks_with_sales = [d for d in current_drinks if d.get('sales_count', 0) > 0]
            if drinks_with_sales:
                logger.info(f"📈 Drinks with sales this cycle:")
                for drink in drinks_with_sales:
                    logger.info(f"   - {drink['name']}: {drink.get('sales_count', 0)} sales, current price ${drink['current_price']}")
            else:
                logger.info(f"📉 No drinks had sales this cycle")
            
            # Calculate new prices
            logger.debug("Calculating price updates...")
            update_data = self.calculate_price_updates()
            
            # Log what will be updated
            logger.info(f"💰 Price calculation results:")
            logger.info(f"   - {len(update_data['drinks'])} drinks processed")
            logger.info(f"   - {len(update_data['changes'])} prices will change")
            if update_data['changes']:
                for drink_id, change in update_data['changes'].items():
                    direction = "↗" if change['new_price'] > change['old_price'] else "↘"
                    logger.info(f"   - {change['name']}: ${change['old_price']} → ${change['new_price']} {direction}")
            
            # Save updated drinks to data manager
            logger.debug(f"Saving {len(update_data['drinks'])} updated drinks to data manager...")
            try:
                success = self.data_manager.update_drinks(update_data['drinks'])
                if success:
                    logger.info("✅ Drinks data saved successfully to data manager")
                else:
                    logger.error("❌ Data manager update_drinks returned False")
                    return
            except Exception as save_error:
                logger.error(f"❌ Failed to save drinks to data manager: {save_error}")
                import traceback
                logger.error(f"Save error traceback: {traceback.format_exc()}")
                return
            
            # Verify data was actually saved
            updated_drinks = self.data_manager.get_drinks()
            logger.info(f"🔍 Verification: Loaded {len(updated_drinks)} drinks after save")
            
            # Check if sales_count was reset
            remaining_sales = [d for d in updated_drinks if d.get('sales_count', 0) > 0]
            if remaining_sales:
                logger.warning(f"⚠️  {len(remaining_sales)} drinks still have sales_count > 0 after reset:")
                for drink in remaining_sales:
                    logger.warning(f"   - {drink['name']}: sales_count = {drink.get('sales_count', 0)}")
            else:
                logger.info("✅ All sales counts successfully reset to 0")
            
            # Send WebSocket notification if there are changes
            if update_data['changes']:
                try:
                    self.websocket_manager.broadcast_price_update(update_data)
                    logger.info(f"📡 Broadcasted price changes: {list(update_data['changes'].keys())}")
                except Exception as ws_error:
                    logger.error(f"❌ Failed to broadcast WebSocket update: {ws_error}")
            else:
                logger.info("📡 No price changes to broadcast")
            
            # Update next refresh time
            settings = self.data_manager.get_settings()
            refresh_cycle = settings.get('refresh_cycle', self.config.get('DEFAULT_REFRESH_CYCLE', 300))
            self.next_refresh_time = datetime.now() + timedelta(seconds=refresh_cycle)
            
            logger.info(f"✅ Price update cycle completed - next cycle at {self.next_refresh_time.strftime('%H:%M:%S')}")
            
        except Exception as e:
            logger.error(f"❌ Error during scheduled price update: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            # Don't re-raise to avoid stopping the scheduler
    
    def _update_sales_history(self, drink, current_sales_count):
        """
        Update the rolling sales history for a drink using fixed-length arrays.
        
        Each drink maintains a fixed array of [0,0,0,0,0] (5 positions).
        At each cycle, prepend the current sales count and remove the oldest.
        
        Args:
            drink: Drink dictionary to update
            current_sales_count: Sales count for the current cycle
        """
        try:
            # Get current history or initialize with fixed-length array
            current_history = drink.get('sales_history', [])
            
            # Ensure we have a proper 5-element array, initialize if needed
            if not isinstance(current_history, list) or len(current_history) != 5:
                current_history = [0, 0, 0, 0, 0]
            
            # Prepend current sales count and remove oldest (last element)
            # This shifts all elements right and drops the 5th element
            new_history = [current_sales_count] + current_history[:4]
            
            # Update drink with new fixed-length history
            drink['sales_history'] = new_history
            
            logger.debug(f"Updated sales history for {drink.get('name', 'Unknown')}: {new_history} (prepended {current_sales_count})")
            
        except Exception as e:
            logger.error(f"Failed to update sales history for drink {drink.get('name', 'Unknown')}: {e}")
            # Ensure drink has proper fixed-length history on error
            drink['sales_history'] = [0, 0, 0, 0, 0]
    
    def _scheduler_health_check(self):
        """
        Periodic health check for the APScheduler.
        Logs scheduler status and job execution timing.
        """
        try:
            jobs = self.scheduler.get_jobs()
            job_info = []
            
            for job in jobs:
                if hasattr(job, 'next_run_time') and job.next_run_time:
                    next_run = job.next_run_time.strftime('%H:%M:%S')
                else:
                    next_run = 'Unknown'
                
                job_info.append({
                    'id': job.id,
                    'next_run': next_run,
                    'func': job.func.__name__ if hasattr(job, 'func') else 'Unknown'
                })
            
            logger.info(f"🏥 Scheduler Health Check - Jobs: {len(jobs)}, Running: {self.scheduler.running}")
            for job in job_info:
                logger.info(f"   Job '{job['id']}' ({job['func']}) - Next: {job['next_run']}")
            
            # Check if main price update job exists
            price_job = next((job for job in jobs if job.id == 'price_update'), None)
            if price_job:
                logger.info(f"💼 Price update job found - Next run: {price_job.next_run_time}")
            else:
                logger.error("⚠️  CRITICAL: Price update job is missing from scheduler!")
            
        except Exception as e:
            logger.error(f"Scheduler health check failed: {e}")
    
    def force_price_update(self):
        """
        Force an immediate price update outside of the normal schedule.
        
        Returns:
            dict: Update results
        """
        try:
            logger.info("Forcing immediate price update")
            
            # Calculate and apply updates
            update_data = self.calculate_price_updates()
            self.data_manager.update_drinks(update_data['drinks'])
            
            # Broadcast changes
            if update_data['changes']:
                self.websocket_manager.broadcast_price_update(update_data)
            
            return update_data
            
        except Exception as e:
            logger.error(f"Failed to force price update: {e}")
            import traceback
            logger.error(f"Force update error traceback: {traceback.format_exc()}")
            raise
    
    def get_engine_status(self):
        """
        Get comprehensive status information about the price engine.
        
        Returns:
            dict: Engine status information
        """
        try:
            settings = self.data_manager.get_settings()
            refresh_cycle = settings.get('refresh_cycle', self.config.get('DEFAULT_REFRESH_CYCLE', 300))
            
            return {
                'running': self.is_running_flag,
                'refresh_cycle': refresh_cycle,
                'next_refresh': self.next_refresh_time.isoformat() if self.next_refresh_time else None,
                'scheduler_running': self.scheduler.running if hasattr(self.scheduler, 'running') else False,
                'job_count': len(self.scheduler.get_jobs()) if self.scheduler else 0
            }
            
        except Exception as e:
            logger.error(f"Failed to get engine status: {e}")
            return {
                'running': False,
                'error': str(e)
            }