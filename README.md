This app checks the modqueue every five minutes. If there are any posts or comments in the queue for shadowbanned, suspended or deleted users, the post or comment will be removed if configured to do so.

The app can be configured to remove posts or comments for deleted users or shadowbanned/suspended users - both options can be controlled independently.

You can also choose to lock comments and posts removed from the queue, and in the case of suspended or shadowbanned users who had queue items you can also choose to reply to removed items with a comment, e.g. if you wish to advise the user of the Reddit appeals process.

Content by moderators will never be removed.

## Change History

### v1.4.2

Fix bug that could result in queues not being pruned properly

### v1.4.1

* Prevent message that should only be left for suspended/shadowbanned users from appearing on comments or posts made by subreddit-banned users

### v1.4.0

* Add option to remove queued content that has been removed by Admin ([ Removed by Reddit ] comment or post bodies)

### v1.3.1

* Mitigate against duplicate actions if Dev Platform is having issues

### v1.3

* Added new option to remove queued comments from removed posts
* Added new option to remove queued comments from deleted posts
* Exempt all moderators from removal by this app (unless they have deleted their account)

### v1.2.5

* Fixed an issue where a crash might result in checks not running until something new hits the modqueue

### v1.2.4

* More robust checking of users - temporary errors will no longer cause active users to be removed from the queue.

### v1.2.0

* Add ability to remove modqueued items from recently banned users
* Add ability to lock removed items when removing from the modqueue
* Reduce the chances of incorrect removals during periods of Reddit infrastructure instability
* Update Devvit and dependencies
* Job execution is staggered on different subreddits to reduce spikes in activity on Devvit infrastructure

### v1.1.1

* Initial Release

## About this app

Modqueue Pruner is open source. [You can find the source here](https://github.com/fsvreddit/queue-pruner).
