# Todo

A list of things that need to be fixed.

### Bugs (things that should work but don't)

 - It right now only loads if its connecting to the db, so I can't test it except on prodocution in Vercel, which isnt very efficient.

### Features (things that shouldm't work yet and don't)
 - Maybe cap the calendar view so it centers on like 6AM-8PM, since that is when most actiity will be happening.
 - Recurring pickups/dropoffs/times available. A kid will often have a repeating schedule (soccer practice is at the same time every week, or like school is the same time), and a driver will often have the same schedule (to change around work), so reacurring events will be helpful.
 - Import other calendar? Could be helpful for automating the putting in process.
 - Maybe add auth/accounts so people can sync their stuff.
 - Maybe customizable bg/other stuff.
 - Add emails to people in settings, so there's just one button where you press "Send schedules" And it emails (or maybe texts?) their schedule to them, instead of just downloading an image.
 - Onboarding/mandatory add mandatory home address addition.
 - An export for each driver's schedule.

### Done (things that should work and do (for now))
 - The Kid's selector shadow should be a single line
 - Change kid's selector so it matches their color (for consistency)
 - Add dropoff vs pickup.
 - Line needs to appear at the time they selected it, not at the nearest hour (maybe snap to nearest 5 min)
 - You should just drag along the calendar view to map out when someone is available.
 - A "Schedule" button, which should take all the things on the calendar, and decide who should drive who where, then email (or text, or smth), a list of where they're driving that day, or email a kid where they're going and who is driving them. The goal is to optimize and solve for driving time, so all ofh the people are sharing the driving load equally, and each kid doesn't have to sit in the car while the other kid is being driven to their thing.
 - Multi kid pickup/dropoffs, bc a lot of times multiple kids need to get picked up/dropped off at the same time.
 - Maybe integrate with some kind of mapping software to add a kind of driving time before each thing? Need to research that