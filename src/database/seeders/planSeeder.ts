import logger from "../../utils/logger";
import {Plan} from "../models/plans.model";

export async function seedBasicPlan(): Promise<void> {
    try {
        const existingPlan = await Plan.findOne({ name: 'Basic' });

        if (!existingPlan) {
            await Plan.create({
                name: 'Basic',
                price: 7777,
                duration: 30
            });

            logger.info('Basic plan seeded successfully');
        }

        logger.info('Basic plan already exists');
    } catch (error) {
        logger.error('Error seeding basic plan:', error);
        throw error;
    }
}