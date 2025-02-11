
// To Do

// 1. run an interval to check users' subs status daily
// 2. sth

import { SubscriptionMonitorService } from '../services/subscription-monitor.service';
import logger from '../utils/logger';

export class SubscriptionChecker {
    private subscriptionMonitorService: SubscriptionMonitorService;
    private checkInterval: NodeJS.Timeout;

    constructor(subscriptionMonitorService: SubscriptionMonitorService) {
        this.subscriptionMonitorService = subscriptionMonitorService;
    }

    start(): void {
        // Run checks immediately when started
        this.runChecks();

        // Then run every 24 hours
        this.checkInterval = setInterval(() => {
            this.runChecks();
        }, 1000); // 24 hours
// 24 * 60 * 60 * 1000
        logger.info('Subscription checker started');
    }

    stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        logger.info('Subscription checker stopped');
    }

    private async runChecks(): Promise<void> {
        try {
            logger.info('Running subscription checks...');

            // Check for expiring subscriptions and send warnings
            await this.subscriptionMonitorService.checkExpiringSubscriptions();

            // Handle expired subscriptions
            await this.subscriptionMonitorService.handleExpiredSubscriptions();

            logger.info('Subscription checks completed');
        } catch (error) {
            logger.error('Error running subscription checks:', error);
        }
    }
}