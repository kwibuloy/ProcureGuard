# Usability test kit

A short, repeatable test of the dashboard with its intended users (Chapter 1, page 6: reviewers in oversight bodies, journalists and researchers, and procuring entities checking a flag about them). It supports the user evaluation alongside `User evaluation kit.docx`. Nothing here measures accuracy: the study is unsupervised, so the test measures whether people can find, understand and act on a flag.

## Setup

- **Participants:** 3 to 5 per user group. Five people find most of the usability problems a design has.
- **Data:** the deployed site or a local run on the real 2024 data, on the latest scoring run.
- **Device:** about half on a laptop and half on a phone, since both layouts are supported.
- **Before starting:** clear the site's data in the browser so the first-visit tour shows.
- **Roles:** one facilitator reads the script and stays neutral; one note-taker records time, errors and quotes.
- **Consent:** participants agree to take part and to anonymous notes. No screen recording without written consent.

## Script

Read aloud:

> Thank you for helping. We are testing the website, not you, so nothing you do is wrong. Please think aloud as you go: say what you are looking for and what you expect to happen. I cannot help during the tasks, but I will answer questions at the end.

## Tasks

Give one task at a time, on a card. Start the timer when the participant finishes reading it. A task fails if it is abandoned or takes longer than its limit.

| # | Task | Success when the participant | Limit |
|---|---|---|---|
| 1 | You have just opened ProcureGuard. In your own words, what does a flag mean? | Says it means statistically unusual and worth review, and does not call it proof of wrongdoing | 2 min |
| 2 | Find the contract the site thinks is most worth reviewing first, and say why it scored as it did. | Opens the top contract and names the indicator that raised the score most | 3 min |
| 3 | Find flagged contracts in Region VII awarded in the second half of 2024. | Applies both filters and reads the count | 3 min |
| 4 | For the contract from task 2, say how its price compares with similar contracts. | Reads the price section (award-to-budget share against the median) | 2 min |
| 5 | Compare two flagged contracts from the same procuring entity side by side. | Adds both to Compare and opens the side-by-side page | 4 min |
| 6 | Save your Region VII filters so you can come back to them tomorrow. | Saves a named view and reopens it | 2 min |
| 7 | Download the contracts from task 3 as a spreadsheet. | Starts the CSV export | 1 min |
| 8 | You represent a procuring entity. Find out how to respond to a flag about one of your contracts. | Finds "Respond to this flag" or the About page answer | 2 min |

## What to record per task

- Completed: yes, with help, or no
- Time on task, in seconds
- Errors: wrong turns, wrong filters, misread figures
- Words used for a flag. Note any accusatory wording ("corrupt", "fraud", "caught"), because it shows where the screen implied more than it should.
- Quotes, positive and negative

## System Usability Scale (SUS)

Hand this out after the tasks. Participants answer each statement from 1 (strongly disagree) to 5 (strongly agree).

1. I think that I would like to use this website frequently.
2. I found the website unnecessarily complex.
3. I thought the website was easy to use.
4. I think that I would need the support of a technical person to be able to use this website.
5. I found the various functions in this website were well integrated.
6. I thought there was too much inconsistency in this website.
7. I would imagine that most people would learn to use this website very quickly.
8. I found the website very cumbersome to use.
9. I felt very confident using the website.
10. I needed to learn a lot of things before I could get going with this website.

**Scoring:** for odd items, subtract 1 from the answer. For even items, subtract the answer from 5. Add the ten results and multiply by 2.5, which gives a score from 0 to 100. Around 68 is average; above 80 is good. Report the mean and the range per user group, and do not present SUS as a percentage.

## Closing questions

1. What was the most confusing moment?
2. Did anything on the site make a contract or a person look guilty? Where?
3. What would you need before you could use this in your work?

## Reporting

For each task, give the completion rate, the median time and the common errors. Then give SUS per group and the three most frequent problems, each with a proposed fix. Record results as measured; if a session was cut short or a task was skipped, say so.
